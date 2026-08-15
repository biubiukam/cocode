import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { patchCredential } from '../../../src/runtime/auth/credentials.ts'
import { resolveAuth } from '../../../src/runtime/auth/resolve.ts'
import { patchCloudRoute } from '../../../src/runtime/auth/settings.ts'

const homes: string[] = []

async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'cocode-resolve-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('resolveAuth', () => {
  it('prefers process env over the credential file', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-file')
    const result = await resolveAuth({
      home,
      env: { DEEPSEEK_API_KEY: 'sk-env' },
      cwd: '/work',
    })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.mode).toBe('byok')
    expect(result.auth.env.DEEPSEEK_API_KEY).toBe('sk-env')
    expect(result.auth.env.DSH_HOME).toBe(home)
  })

  it('skips the gate when a shared DeepSeek key exists', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-file')
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.provider).toBe('deepseek-official')
  })

  it('uses cloud when the account and key are both present', async () => {
    const home = await tempHome()
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_x')
    await patchCloudRoute(home, 'https://cocode.agency', [{ id: 'cloud-1', name: 'Cloud' }])
    const result = await resolveAuth({
      home,
      env: {},
      cwd: '/work',
      accountHome: home,
      cloudAccount: true,
      cloudModels: [{ id: 'cloud-1', name: 'Cloud' }],
    })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.mode).toBe('cocode')
    expect(result.auth.provider).toBe('cocode-cloud')
  })

  it('opens the gate when nothing is configured', async () => {
    const home = await tempHome()
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result).toMatchObject({ status: 'gate', home })
  })

  it('does not treat a cloud key without a route as ready', async () => {
    const home = await tempHome()
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_x')
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('gate')
  })

  it('does not trust a persisted cloud route without an account', async () => {
    const home = await tempHome()
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_x')
    await patchCloudRoute(home, 'https://cocode.agency', [{ id: 'cloud-1', name: 'Cloud' }])
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('gate')
  })

  it('uses the configured credential ref for a non-DeepSeek provider', async () => {
    const home = await tempHome()
    await writeFile(
      join(home, 'settings.yaml'),
      [
        'agent-default-model:',
        '  provider: ai-gateway',
        '  model: gateway-model',
        'llm-pi-ai:',
        '  providers:',
        '    ai-gateway:',
        '      apiKeyEnv: AI_GATEWAY_API_KEY',
        '      baseURL: https://gateway.example/v1',
        '      api: openai-responses',
        '      models:',
        '        - id: gateway-model',
      ].join('\n'),
    )
    await patchCredential(home, 'AI_GATEWAY_API_KEY', 'gateway-secret')
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.provider).toBe('ai-gateway')
    expect(result.auth.env.AI_GATEWAY_API_KEY).toBe('gateway-secret')
    expect(result.auth.env.DEEPSEEK_API_KEY).toBeUndefined()
  })

  it('does not use a DeepSeek key for a configured non-DeepSeek provider', async () => {
    const home = await tempHome()
    await writeFile(
      join(home, 'settings.yaml'),
      'agent-default-model:\n  provider: ai-gateway\n  model: gateway-model\n',
    )
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-wrong-provider')
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('gate')
  })

  it('accepts a route explicitly locked by the environment', async () => {
    const home = await tempHome()
    await writeFile(
      join(home, 'settings.yaml'),
      [
        'agent-default-model:',
        '  provider: ai-gateway',
        '  model: gateway-model',
        'llm-pi-ai:',
        '  providers:',
        '    ai-gateway:',
        '      apiKeyEnv: AI_GATEWAY_API_KEY',
        '      writable: false',
      ].join('\n'),
    )
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.provider).toBe('ai-gateway')
  })

  it('prefers agent-default-model when both channels are configured', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-file')
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_x')
    await writeFile(
      join(home, 'settings.yaml'),
      [
        'agent-default-model:',
        '  provider: deepseek-official',
        '  model: deepseek-v4-flash',
        'llm-pi-ai:',
        '  providers:',
        '    cocode-cloud:',
        '      apiKeyEnv: COCODE_CLOUD_API_KEY',
        '      baseURL: https://cocode.agency/v1',
      ].join('\n'),
    )
    const result = await resolveAuth({
      home,
      env: { DEEPSEEK_API_KEY: 'sk-env', COCODE_CLOUD_API_KEY: 'ck_env' },
      cwd: '/work',
    })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.mode).toBe('byok')
    expect(result.auth.provider).toBe('deepseek-official')
    expect(result.auth.env.DEEPSEEK_API_KEY).toBe('sk-env')
    expect(result.auth.env.COCODE_CLOUD_API_KEY).toBeUndefined()
  })

  it('falls back to BYOK when the preferred Cloud channel is gone', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-file')
    await writeFile(
      join(home, 'settings.yaml'),
      'agent-default-model:\n  provider: cocode-cloud\n  model: cloud-1\n',
    )
    const result = await resolveAuth({ home, env: {}, cwd: '/work' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.auth.mode).toBe('byok')
  })

  it('fails explicitly for an invalid agency origin', async () => {
    const home = await tempHome()
    await expect(
      resolveAuth({
        home,
        env: { COCODE_AGENCY_ORIGIN: 'http://evil.example' },
        cwd: '/work',
      }),
    ).rejects.toThrow(/AUTH_ORIGIN_HTTPS/)
  })
})
