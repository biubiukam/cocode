import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisionService } from '../../packages/vision/src/index.ts'
import type { RuntimeContext } from '../../packages/vision/src/index.ts'

const attachment = {
  attachmentId: 'att-1',
  mediaType: 'image/png' as const,
  bytes: 3,
  width: 1,
  height: 1,
}

function context(): RuntimeContext {
  return {
    agents: {} as RuntimeContext['agents'],
    sessions: {} as RuntimeContext['sessions'],
    root: {} as RuntimeContext['root'],
    get(name) {
      if (name === 'attachments') {
        return {
          async readImage() {
            return { ref: attachment, data: new Uint8Array([1, 2, 3]) }
          },
        }
      }
      if (name === 'credentials') {
        return {
          async resolve(ref: string) {
            return ref === 'OPENAI_API_KEY' || ref === 'COCODE_NUT_API_KEY' || ref === 'CUSTOM_CLOUD_KEY'
              ? { value: 'secret-value' }
              : undefined
          },
        }
      }
      return undefined
    },
    on() {
      return () => undefined
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cocode vision bridge', () => {
  it('converts an attachment into evidence while preserving the image block', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'a diagram' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const service = createVisionService(context(), {
      provider: 'user',
      user: { endpoint: 'https://vision.example/v1/chat/completions', model: 'gpt-4o-mini' },
    })

    await expect(service.prepareBlocks([
      { type: 'text', text: 'What is shown?' },
      { type: 'image', attachment },
    ])).resolves.toEqual([
      { type: 'text', text: 'What is shown?' },
      { type: 'text', text: '[Image evidence]\na diagram' },
      { type: 'image', attachment },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('data:image/png;base64,AQID')
    expect(String(request?.headers && (request.headers as Record<string, string>).authorization)).toBe('Bearer secret-value')
  })

  it('reports configuration without exposing credential values', async () => {
    const service = createVisionService(context(), {
      provider: 'user',
      user: {
        endpoint: 'https://user:secret@vision.example/v1?api_key=secret-query#token',
        model: 'gpt-4o-mini',
      },
    })
    await expect(service.status()).resolves.toEqual({
      enabled: true,
      provider: 'user',
      configured: true,
      model: 'gpt-4o-mini',
      endpoint: 'https://vision.example/v1',
    })
  })

  it('derives the cocode target from the account-selected cloud route', async () => {
    vi.stubEnv('COCODE_LLM_PROVIDERS', JSON.stringify({
      'cocode-nut': {
        baseURL: 'https://cocode.example/v1',
        apiKeyEnv: 'COCODE_NUT_API_KEY',
        models: [{ id: 'cloud-text-model' }],
      },
    }))
    const service = createVisionService(context(), { provider: 'cocode' })

    await expect(service.status()).resolves.toEqual({
      enabled: true,
      provider: 'cocode',
      configured: true,
      model: 'gpt-luna',
      endpoint: 'https://cocode.example/v1/chat/completions',
    })
  })

  it('reuses a custom credential reference from the account cloud route', async () => {
    vi.stubEnv('COCODE_LLM_PROVIDERS', JSON.stringify({
      'cocode-nut': {
        baseURL: 'https://cocode.example/v1',
        apiKeyEnv: 'CUSTOM_CLOUD_KEY',
      },
    }))
    const service = createVisionService(context(), { provider: 'cocode' })

    await expect(service.status()).resolves.toMatchObject({ configured: true })
  })

  it('keeps the native image block when the bridge has no credential', async () => {
    const service = createVisionService(context(), {
      provider: 'cocode',
      cocode: { endpoint: 'https://cocode.example/v1', credentialRef: 'MISSING_KEY' },
    })
    await expect(service.prepareBlocks([{ type: 'image', attachment }])).resolves.toEqual([
      { type: 'image', attachment },
    ])
  })

  it('removes the native image block after producing evidence for a text-only model', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'visible text' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ))
    const service = createVisionService(context(), {
      provider: 'user',
      user: { endpoint: 'https://vision.example/v1/chat/completions', model: 'vision-model' },
    })

    await expect(service.prepareBlocks(
      [{ type: 'image', attachment }],
      { preserveImages: false },
    )).resolves.toEqual([{ type: 'text', text: '[Image evidence]\nvisible text' }])
  })
})
