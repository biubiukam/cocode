import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../packages/vision/src/index.ts'
import type { CocodeVisionService, RuntimeContext } from '../../packages/vision/src/index.ts'
import { loadVisionConfig, mergeVisionConfig, visionConfigPath } from '../../packages/vision/src/config.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('vision user configuration', () => {
  it('loads provider settings from COCODE_HOME/vision.yaml', () => {
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

    expect(loadVisionConfig({ COCODE_HOME: home })).toEqual({
      provider: 'user',
      timeoutMs: 30000,
      user: {
        endpoint: 'https://vision.example/v1/chat/completions',
        model: 'vision-model',
        credentialRef: 'OPENAI_API_KEY',
      },
    })
    expect(visionConfigPath({ COCODE_HOME: home })).toBe(join(home, 'vision.yaml'))
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

    expect(() => loadVisionConfig({ COCODE_HOME: home })).toThrow('invalid provider')
  })

  it('applies the persisted file and lets environment variables override it', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cocode-vision-'))
    temporaryDirectories.push(home)
    writeFileSync(join(home, 'vision.yaml'), [
      'provider: user',
      'user:',
      '  endpoint: https://stored.example/v1/chat/completions',
      '  model: stored-model',
      '  credentialRef: STORED_KEY',
    ].join('\n'))
    vi.stubEnv('COCODE_HOME', home)
    vi.stubEnv('COCODE_VISION_USER_MODEL', 'env-model')

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
      model: 'env-model',
      endpoint: 'https://stored.example/v1/chat/completions',
    })
  })
})
