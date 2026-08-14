import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeAccount, readAccount } from '../../../src/runtime/auth/account.ts'
import { patchCredential, readCredentials } from '../../../src/runtime/auth/credentials.ts'
import { createAuthStore } from '../../../src/runtime/auth/store.ts'
import { patchCloudRoute, readSettings } from '../../../src/runtime/auth/settings.ts'

const homes: string[] = []

async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'cocode-store-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('AuthStore', () => {
  it('starts at the gate with an empty home', async () => {
    const store = await createAuthStore({ home: await tempHome(), env: {} })
    expect(store.snapshot().phase).toBe('gate')
    expect(() => store.resolved()).toThrow(/not ready/)
  })

  it('writes a BYOK key in harness mapping form', async () => {
    const home = await tempHome()
    const store = await createAuthStore({ home, env: {} })
    store.dispatch({
      type: 'submitByok',
      provider: 'deepseek-official',
      key: 'sk-user',
    })
    await store.waitUntilReady()
    expect(store.snapshot().phase).toBe('ready')
    expect(store.snapshot().mode).toBe('byok')
    expect(JSON.stringify(store.snapshot())).not.toMatch(/sk-user/)
    expect(await readCredentials(home)).toEqual({
      DEEPSEEK_API_KEY: 'sk-user',
    })
  })

  it('logs in with device flow and keeps an existing BYOK key', async () => {
    const home = await tempHome()
    const byokStore = await createAuthStore({ home, env: {} })
    byokStore.dispatch({
      type: 'submitByok',
      provider: 'deepseek-official',
      key: 'sk-keep',
    })
    await byokStore.waitUntilReady()

    let tokenCalls = 0
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/v1/auth/device/authorizations')) {
        return json(201, {
          device_code: 'dc',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://cocode.agency/device',
          verification_uri_complete: 'https://cocode.agency/device?user_code=ABCD-EFGH',
          expires_in: 600,
          interval: 1,
        })
      }
      if (url.endsWith('/v1/auth/device/token')) {
        tokenCalls += 1
        return json(200, {
          access_token: 'access-secret',
          refresh_token: 'refresh-secret',
          expires_in: 900,
        })
      }
      if (url.endsWith('/v1/me') && !url.includes('api-keys') && !url.includes('models')) {
        return json(200, {
          user: { display_name: 'Ada', email: 'ada@example.com' },
        })
      }
      if (url.endsWith('/v1/me/api-keys')) {
        return json(201, { secret: 'ck_live_new', id: 'key-1' })
      }
      if (url.endsWith('/v1/me/models')) {
        return json(200, { data: [{ id: 'cloud-1', name: 'Cloud' }] })
      }
      if (url.endsWith('/v1/auth/token/revoke')) {
        return new Response(null, { status: 204 })
      }
      return json(404, { title: 'missing' })
    }

    const opened: string[] = []
    const store = await createAuthStore({
      home,
      env: {},
      client: { fetch: fetchImpl, delay: async () => undefined },
      openUrl: (url) => opened.push(url),
    })
    expect(store.snapshot().phase).toBe('ready')
    await store.logout()
    expect(store.snapshot().phase).toBe('gate')
    expect(await readCredentials(home)).toEqual({ DEEPSEEK_API_KEY: 'sk-keep' })

    store.dispatch({ type: 'chooseCocode' })
    const ready = await store.waitUntilReady()
    expect(ready.mode).toBe('cocode')
    expect(store.snapshot().device).toBeUndefined()
    expect(JSON.stringify(store.snapshot())).not.toMatch(/access-secret|ck_live/)
    expect(opened[0]).toContain('user_code=ABCD-EFGH')
    expect((await readCredentials(home)).DEEPSEEK_API_KEY).toBe('sk-keep')
    expect((await readCredentials(home)).COCODE_CLOUD_API_KEY).toBe('ck_live_new')
    expect((await readSettings(home)).hasCloudRoute).toBe(true)
    expect(tokenCalls).toBe(1)
  })

  it('refreshes an expiring Cloud account before resolving it', async () => {
    const home = await tempHome()
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_existing')
    await patchCloudRoute(home, 'https://cocode.agency', [{ id: 'cloud-1', name: 'Cloud' }])
    await writeAccount(home, {
      origin: 'https://cocode.agency',
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      accessExpiresAt: Date.now() + 1_000,
      personalKeyId: 'key-1',
      personalKeyName: 'Cocode TUI',
    })
    let refreshCalls = 0
    const store = await createAuthStore({
      home,
      env: {},
      client: {
        fetch: async (input) => {
          expect(String(input)).toContain('/v1/auth/token/refresh')
          refreshCalls += 1
          return json(200, {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 900,
          })
        },
      },
    })
    expect(store.snapshot().phase).toBe('ready')
    expect(refreshCalls).toBe(1)
    expect((await readAccount(home))?.accessToken).toBe('new-access')
  })

  it('clears failed Cloud refresh state while preserving BYOK', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-keep')
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_existing')
    await patchCloudRoute(home, 'https://cocode.agency', [{ id: 'cloud-1', name: 'Cloud' }])
    await writeAccount(home, {
      origin: 'https://cocode.agency',
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      accessExpiresAt: Date.now() + 1_000,
      personalKeyId: 'key-1',
    })
    const store = await createAuthStore({
      home,
      env: {},
      client: {
        fetch: async () => json(401, { code: 'invalid_grant' }),
      },
    })
    expect(store.snapshot().mode).toBe('byok')
    expect(await readAccount(home)).toBeUndefined()
    expect(await readCredentials(home)).toEqual({ DEEPSEEK_API_KEY: 'sk-keep' })
    expect((await readSettings(home)).hasCloudRoute).toBe(false)
  })

  it('does not persist a Cloud key when model validation fails', async () => {
    const home = await tempHome()
    const store = await createAuthStore({
      home,
      env: {},
      client: {
        fetch: async (input) => {
          const url = String(input)
          if (url.endsWith('/v1/auth/device/authorizations')) {
            return json(201, {
              device_code: 'dc',
              user_code: 'ABCD-EFGH',
              verification_uri: 'https://cocode.agency/device',
              verification_uri_complete: 'https://cocode.agency/device?user_code=ABCD-EFGH',
              expires_in: 600,
              interval: 1,
            })
          }
          if (url.endsWith('/v1/auth/device/token')) {
            return json(200, {
              access_token: 'access',
              refresh_token: 'refresh',
              expires_in: 900,
            })
          }
          if (url.endsWith('/v1/me')) {
            return json(200, { user: { display_name: 'Ada' } })
          }
          if (url.endsWith('/v1/me/api-keys')) {
            return json(201, { secret: 'ck_live_new', id: 'key-1' })
          }
          if (url.endsWith('/v1/me/models')) return json(200, { data: [] })
          return json(404, { title: 'missing' })
        },
        delay: async () => undefined,
      },
      openUrl: () => undefined,
    })
    store.dispatch({ type: 'chooseCocode' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(store.snapshot().phase).toBe('failed')
    expect((await readCredentials(home)).COCODE_CLOUD_API_KEY).toBeUndefined()
    expect(await readAccount(home)).toBeUndefined()
  })

  it('does not continue a device operation after cancellation', async () => {
    const home = await tempHome()
    const store = await createAuthStore({
      home,
      env: {},
      client: {
        fetch: async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            })
          }),
      },
    })
    store.dispatch({ type: 'chooseCocode' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    store.dispatch({ type: 'cancel' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.snapshot().phase).toBe('gate')
    expect(await readCredentials(home)).toEqual({})
    expect(await readAccount(home)).toBeUndefined()
  })
})
