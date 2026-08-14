import { describe, expect, it } from 'vitest'
import {
  mintPersonalKey,
  pollDeviceToken,
  revokeToken,
  startDeviceAuthorization,
} from '../../../src/runtime/auth/device-flow.ts'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('device-flow', () => {
  it('starts an authorization', async () => {
    const fetchImpl: typeof fetch = async () =>
      json(201, {
        device_code: 'dc',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://cocode.agency/device',
        verification_uri_complete: 'https://cocode.agency/device?user_code=WDJB-MJHT',
        expires_in: 600,
        interval: 1,
      })
    const started = await startDeviceAuthorization('https://cocode.agency', {
      fetch: fetchImpl,
    })
    expect(started.user_code).toBe('WDJB-MJHT')
  })

  it('polls until a token arrives', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      if (calls === 1) {
        return json(400, { code: 'authorization_pending' })
      }
      return json(200, {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 900,
      })
    }
    const token = await pollDeviceToken(
      'https://cocode.agency',
      'dc',
      1,
      600,
      new AbortController().signal,
      { fetch: fetchImpl, delay: async () => undefined },
    )
    expect(token.access_token).toBe('at')
    expect(calls).toBe(2)
  })

  it('slows down when asked', async () => {
    let calls = 0
    let lastWait = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      if (calls === 1) return json(400, { error: 'slow_down' })
      return json(200, {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 1,
      })
    }
    await pollDeviceToken('https://cocode.agency', 'dc', 2, 600, new AbortController().signal, {
      fetch: fetchImpl,
      delay: async (ms) => {
        lastWait = ms
      },
    })
    expect(lastWait).toBe(7000)
  })

  it('stops polling when the device authorization expires', async () => {
    let now = 0
    await expect(
      pollDeviceToken('https://cocode.agency', 'dc', 1, 1, new AbortController().signal, {
        now: () => {
          const value = now
          now = 1001
          return value
        },
        delay: async () => undefined,
        fetch: async () => json(400, { code: 'authorization_pending' }),
      }),
    ).rejects.toThrow(/expired/)
  })

  it('returns the minted secret once', async () => {
    const minted = await mintPersonalKey('https://cocode.agency', 'at', {
      fetch: async () => json(201, { secret: 'ck_live_secret', id: 'key-1' }),
    })
    expect(minted).toEqual({ secret: 'ck_live_secret', id: 'key-1' })
  })

  it('rejects unsafe verification URLs', async () => {
    await expect(
      startDeviceAuthorization('https://cocode.agency', {
        fetch: async () =>
          json(201, {
            device_code: 'dc',
            user_code: 'CODE',
            verification_uri: 'javascript:alert(1)',
            verification_uri_complete: 'https://cocode.agency/device?code=CODE',
            expires_in: 600,
            interval: 1,
          }),
      }),
    ).rejects.toThrow(/verification_uri must use https/)
  })

  it('revoke failures still resolve', async () => {
    await expect(
      revokeToken('https://cocode.agency', 'rt', {
        fetch: async () => {
          throw new Error('offline')
        },
      }),
    ).resolves.toBeUndefined()
  })
})
