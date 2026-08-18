import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeHostRuntimeEnv, resolveHostRuntimeEnv } from '@cocode/host-supervisor'
import { apply, createVisionService } from '../../packages/vision/src/index.ts'
import type { CocodeVisionService, RuntimeContext } from '../../packages/vision/src/index.ts'
import { loadVisionConfig, mergeVisionConfig, visionConfigPath } from '../../packages/vision/src/config.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('vision user configuration', () => {
  it('loads provider settings from COCODE_DSH_HOME/vision.yaml', () => {
    const home = mkdtempSync(join(tmpdir(), 'cocode-vision-'))
    temporaryDirectories.push(home)
    writeFileSync(join(home, 'vision.yaml'), [
      'provider: user',
      'timeoutMs: 30000',
      'user:',
      '  endpoint: https://vision.example/v1/chat/completions',
      '  model: vision-model',
      '  credentialRef: OPENAI_API_KEY',
    ].join('\n'))

    expect(loadVisionConfig({ COCODE_DSH_HOME: home })).toEqual({
      provider: 'user',
      timeoutMs: 30000,
      user: {
        endpoint: 'https://vision.example/v1/chat/completions',
        model: 'vision-model',
        credentialRef: 'OPENAI_API_KEY',
      },
    })
    expect(visionConfigPath({ COCODE_DSH_HOME: home })).toBe(join(home, 'vision.yaml'))
  })

  it('keeps the vision config when a shared Host lacks the client COCODE_HOME', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cocode-vision-'))
    temporaryDirectories.push(home)
    writeFileSync(join(home, 'vision.yaml'), [
      'provider: user',
      'user:',
      '  endpoint: https://vision.example/v1/chat/completions',
      '  model: vision-model',
      '  credentialRef: VISION_KEY',
    ].join('\n'))

    const runtimeEnv = resolveHostRuntimeEnv({ COCODE_DSH_HOME: home })
    const hostEnv = mergeHostRuntimeEnv({}, runtimeEnv, join(home, 'dsh'))
    const stored = loadVisionConfig(hostEnv)
    const service = createVisionService({
      get(name) {
        if (name !== 'credentials') return undefined
        return { resolve: async (ref: string) => ref === 'VISION_KEY' ? { value: 'test-only' } : undefined }
      },
    }, mergeVisionConfig(stored, { provider: 'user' }))

    await expect(service.status()).resolves.toMatchObject({
      provider: 'user',
      configured: true,
      model: 'vision-model',
      endpoint: 'https://vision.example/v1/chat/completions',
    })
  })

  it('lets explicit runtime values override persisted values', () => {
    expect(mergeVisionConfig({
      provider: 'user',
      user: { endpoint: 'https://stored.example', model: 'stored-model' },
    }, {
      user: { model: 'runtime-model' },
    })).toEqual({
      provider: 'user',
      user: { endpoint: 'https://stored.example', model: 'runtime-model' },
    })
  })

  it('rejects malformed provider configuration', () => {
    const home = mkdtempSync(join(tmpdir(), 'cocode-vision-'))
    temporaryDirectories.push(home)
    writeFileSync(join(home, 'vision.yaml'), 'provider: unsupported\n')

    expect(() => loadVisionConfig({ COCODE_DSH_HOME: home })).toThrow('invalid provider')
  })

  it('uses the persisted file as the vision configuration source', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cocode-vision-'))
    temporaryDirectories.push(home)
    writeFileSync(join(home, 'vision.yaml'), [
      'provider: user',
      'user:',
      '  endpoint: https://stored.example/v1/chat/completions',
      '  model: stored-model',
      '  credentialRef: STORED_KEY',
    ].join('\n'))
    vi.stubEnv('COCODE_DSH_HOME', home)

    const provided = new Map<string, unknown>()
    const context: RuntimeContext = {
      get(name) {
        if (name !== 'credentials') return undefined
        return { resolve: async (ref: string) => ref === 'STORED_KEY' ? { value: 'secret' } : undefined }
      },
      provide(name, value) {
        provided.set(name, value)
      },
    }
    apply(context)

    const service = provided.get('cocodeVision') as CocodeVisionService
    await expect(service.status()).resolves.toMatchObject({
      provider: 'user',
      configured: true,
      model: 'stored-model',
      endpoint: 'https://stored.example/v1/chat/completions',
    })
  })

  it('registers /vision and persists model changes without storing secrets', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cocode-vision-'))
    temporaryDirectories.push(home)
    vi.stubEnv('COCODE_DSH_HOME', home)

    type RegisteredCommand = { handler(input: { rawInput: string; signal: AbortSignal }): Promise<unknown> }
    let registered: RegisteredCommand | undefined
    const provided = new Map<string, unknown>()
    const context: RuntimeContext = {
      get(name) {
        if (name === 'credentials') return { resolve: async () => ({ value: 'secret-value' }) }
        if (name === 'commands') {
          return {
            register(definition: RegisteredCommand) {
              registered = definition
              return () => undefined
            },
          }
        }
        return undefined
      },
      provide(name, value) {
        provided.set(name, value)
      },
    }
    apply(context)

    await expect(registered?.handler({ rawInput: 'provider user', signal: new AbortController().signal })).resolves.toMatchObject({
      kind: 'success',
    })
    await expect(registered?.handler({ rawInput: 'model vision-model', signal: new AbortController().signal })).resolves.toMatchObject({
      kind: 'success',
    })
    expect(loadVisionConfig({ COCODE_DSH_HOME: home })).toMatchObject({
      user: { model: 'vision-model' },
    })
    expect(JSON.stringify(loadVisionConfig({ COCODE_DSH_HOME: home }))).not.toContain('secret-value')
    await expect((provided.get('cocodeVision') as CocodeVisionService).status()).resolves.toMatchObject({
      provider: 'user',
      model: 'vision-model',
    })
  })
})
