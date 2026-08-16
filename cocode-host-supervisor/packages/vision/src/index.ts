import { loadVisionConfig, mergeVisionConfig, saveVisionConfig } from './config.ts'

export type ContentBlock = { type: string; text?: string; [key: string]: unknown }
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
export type RuntimeContext = {
  get<T = unknown>(name: string): T | undefined
  provide?(name: string, value: unknown): void
  effect?(create: () => unknown, label?: string): unknown
}

export type VisionProvider = 'user' | 'cocode'

export type VisionEndpointConfig = {
  endpoint?: string
  model?: string
  credentialRef?: string
}

export type VisionConfig = {
  provider?: VisionProvider
  user?: VisionEndpointConfig
  cocode?: VisionEndpointConfig
  timeoutMs?: number
  autoRead?: boolean
  /** Keep the original image block when the selected bridge is not configured. */
  fallbackToNative?: boolean
}

type CredentialsService = {
  resolve(ref: string): Promise<{ value: string } | undefined>
}

type AttachmentService = {
  readImage(ref: Record<string, unknown>, signal?: AbortSignal): Promise<{
    ref: { mediaType: ImageMediaType }
    data: Uint8Array
  }>
}

export type VisionStatus = {
  enabled: boolean
  provider: VisionProvider
  configured: boolean
  model: string
  endpoint: string | undefined
  reason?: string
}

export type CocodeVisionService = {
  status(): Promise<VisionStatus>
  prepareBlocks(
    blocks: readonly ContentBlock[],
    options?: { preserveImages?: boolean },
  ): Promise<ContentBlock[]>
  configure(patch: VisionConfig): Promise<VisionStatus>
}

type VisionCommandService = {
  register(definition: {
    name: string
    description: string
    input?: { hint: string }
    handler(invocation: { rawInput: string; signal: AbortSignal }): Promise<
      | { kind: 'success'; text?: string }
      | { kind: 'error'; text: string }
    >
  }): () => void
}

const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_COCODE_MODEL = 'gpt-luna'
const DEFAULT_USER_CREDENTIAL = 'OPENAI_API_KEY'
const DEFAULT_COCODE_CREDENTIAL = 'COCODE_CLOUD_API_KEY'
const IMAGE_BLOCK_TYPE = 'image'

/** Cocode-owned visual bridge. It speaks an OpenAI-compatible HTTP contract without third-party runtime coupling. */
export const name = 'cocode-vision'
export const inject = ['attachments']

export function apply(ctx: RuntimeContext, rawConfig: VisionConfig = {}): void {
  const service = createVisionService(ctx, mergeVisionConfig(loadVisionConfig(), rawConfig), {
    updateConfig: async (patch) => {
      const next = mergeVisionConfig(loadVisionConfig(), patch)
      saveVisionConfig(next)
      return mergeVisionConfig(next, rawConfig)
    },
  })
  ctx.provide?.('cocodeVision', service)
  registerVisionCommand(ctx, service)
}

export function createVisionService(
  ctx: RuntimeContext,
  rawConfig: VisionConfig = {},
  options: { updateConfig?: (patch: VisionConfig) => Promise<VisionConfig> } = {},
): CocodeVisionService {
  let config = resolveConfig(rawConfig)

  const status = async (): Promise<VisionStatus> => {
    const target = targetOf(config)
    if (!config.autoRead) {
      return {
        enabled: false,
        provider: config.provider,
        configured: false,
        model: target.model,
        endpoint: target.endpoint === undefined ? undefined : redactEndpoint(target.endpoint),
        reason: 'automatic image reading is disabled',
      }
    }
    if (target.endpoint === undefined || target.model === '') {
      return {
        enabled: true,
        provider: config.provider,
        configured: false,
        model: target.model,
        endpoint: undefined,
        reason: target.endpoint === undefined ? 'vision endpoint is not configured' : 'vision model is not configured',
      }
    }
    const credential = await resolveCredential(ctx, target.credentialRef)
    return {
      enabled: true,
      provider: config.provider,
      configured: credential !== undefined,
      model: target.model,
      endpoint: redactEndpoint(target.endpoint),
      ...(credential === undefined ? { reason: `credential ${target.credentialRef} is not configured` } : {}),
    }
  }

  return {
    status,
    configure: async (patch) => {
      if (options.updateConfig === undefined) throw new Error('vision configuration is not writable in this runtime')
      config = resolveConfig(await options.updateConfig(patch))
      return status()
    },
    prepareBlocks: async (blocks, options = {}) => {
      if (!config.autoRead || !blocks.some((block) => block.type === IMAGE_BLOCK_TYPE)) {
        return [...blocks]
      }
      const target = targetOf(config)
      if (config.fallbackToNative && !(await isConfigured(ctx, target))) return [...blocks]
      const prompt = blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim()
      const output: ContentBlock[] = []
      for (const block of blocks) {
        if (block.type !== IMAGE_BLOCK_TYPE) {
          output.push(block)
          continue
        }
        const attachment = asRecord(block.attachment)
        if (attachment === undefined) throw new Error('vision image block is missing its attachment reference')
        const evidence = await describeImage(ctx, config, attachment, prompt)
        output.push({
          type: 'text',
          text: `[Image evidence]\n${evidence}`,
        })
        // Native vision routes keep the durable reference. Text-only routes
        // consume only the generated evidence so their adapter never sees an
        // unsupported image block.
        if (options.preserveImages !== false) output.push(block)
      }
      return output
    },
  }
}

async function describeImage(
  ctx: RuntimeContext,
  config: ResolvedVisionConfig,
  attachment: Record<string, unknown>,
  prompt: string,
): Promise<string> {
  const store = ctx.get('attachments') as AttachmentService | undefined
  if (store === undefined) throw new Error('vision capability requires the attachment store')
  const target = targetOf(config)
  if (target.endpoint === undefined) throw new Error('vision endpoint is not configured')
  const credential = await resolveCredential(ctx, target.credentialRef)
  if (credential === undefined) throw new Error(`vision credential ${target.credentialRef} is not configured`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const image = await store.readImage(attachment, controller.signal)
    const response = await fetch(normalizeEndpoint(target.endpoint), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential.value}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: target.model,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt || 'Describe this image precisely. Include visible text, layout, objects, and uncertainty.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.ref.mediaType};base64,${Buffer.from(image.data).toString('base64')}`,
              },
            },
          ],
        }],
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`vision provider returned HTTP ${response.status}`)
    }
    const payload = await response.json() as unknown
    const text = readResponseText(payload)
    if (text === undefined) throw new Error('vision provider returned no text evidence')
    return text
  } catch (error) {
    if (controller.signal.aborted) throw new Error('vision provider request timed out')
    throw error instanceof Error ? new Error(safeVisionError(error.message)) : new Error('vision provider request failed')
  } finally {
    clearTimeout(timer)
  }
}

type ResolvedVisionConfig = {
  provider: VisionProvider
  user: ResolvedEndpointConfig
  cocode: ResolvedEndpointConfig
  timeoutMs: number
  autoRead: boolean
  fallbackToNative: boolean
}

type ResolvedEndpointConfig = {
  endpoint: string | undefined
  model: string
  credentialRef: string
}

function resolveConfig(raw: VisionConfig): ResolvedVisionConfig {
  const provider = envProvider() ?? raw.provider ?? 'cocode'
  if (provider !== 'user' && provider !== 'cocode') {
    throw new Error('cocode-vision provider must be "user" or "cocode"')
  }
  const user = {
    endpoint: process.env.COCODE_VISION_USER_ENDPOINT ?? raw.user?.endpoint,
    model: process.env.COCODE_VISION_USER_MODEL ?? raw.user?.model ?? '',
    credentialRef:
      process.env.COCODE_VISION_USER_CREDENTIAL_REF ?? raw.user?.credentialRef ?? DEFAULT_USER_CREDENTIAL,
  }
  const cocodeRoute = readCocodeRoute()
  const cocode = {
    endpoint:
      process.env.COCODE_VISION_ENDPOINT ??
      raw.cocode?.endpoint ??
      (cocodeRoute?.baseURL === undefined ? undefined : appendChatCompletions(cocodeRoute.baseURL)),
    model: process.env.COCODE_VISION_MODEL ?? raw.cocode?.model ?? DEFAULT_COCODE_MODEL,
    credentialRef:
      process.env.COCODE_VISION_CREDENTIAL_REF ??
      raw.cocode?.credentialRef ??
      cocodeRoute?.credentialRef ??
      DEFAULT_COCODE_CREDENTIAL,
  }
  const timeoutMs = Number(process.env.COCODE_VISION_TIMEOUT_MS ?? raw.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('vision timeoutMs must be a positive safe integer')
  return {
    provider,
    user,
    cocode,
    timeoutMs,
    autoRead: raw.autoRead ?? true,
    fallbackToNative: raw.fallbackToNative ?? true,
  }
}

type CocodeRoute = {
  baseURL?: string
  credentialRef?: string
}

function readCocodeRoute(): CocodeRoute | undefined {
  const raw = process.env.COCODE_LLM_PROVIDERS
  if (raw === undefined || raw.trim() === '') return undefined
  try {
    const root = JSON.parse(raw) as unknown
    const route = asRecord(asRecord(root)?.['cocode-cloud'])
    if (route === undefined) return undefined
    const baseURL = typeof route.baseURL === 'string' && route.baseURL.trim() !== ''
      ? route.baseURL.trim()
      : undefined
    const credentialRef = typeof route.apiKeyEnv === 'string' && route.apiKeyEnv.trim() !== ''
      ? route.apiKeyEnv.trim()
      : undefined
    return {
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(credentialRef === undefined ? {} : { credentialRef }),
    }
  } catch {
    return undefined
  }
}

function appendChatCompletions(baseURL: string): string {
  const normalized = normalizeEndpoint(baseURL)
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`
}

async function isConfigured(ctx: RuntimeContext, target: ResolvedEndpointConfig): Promise<boolean> {
  if (target.endpoint === undefined || target.model === '') return false
  return (await resolveCredential(ctx, target.credentialRef)) !== undefined
}

function targetOf(config: ResolvedVisionConfig): ResolvedEndpointConfig {
  return config.provider === 'user' ? config.user : config.cocode
}

async function resolveCredential(
  ctx: RuntimeContext,
  ref: string,
): Promise<{ value: string } | undefined> {
  const credentials = ctx.get('credentials') as CredentialsService | undefined
  if (credentials === undefined) return undefined
  return credentials.resolve(ref)
}

function readResponseText(value: unknown): string | undefined {
  const root = asRecord(value)
  const choices = root?.choices
  if (!Array.isArray(choices)) return undefined
  const message = asRecord(choices[0])?.message
  const content = asRecord(message)?.content
  if (typeof content === 'string' && content.trim() !== '') return content.trim()
  if (!Array.isArray(content)) return undefined
  const text = content
    .map((part) => asRecord(part)?.text)
    .filter((part): part is string => typeof part === 'string')
    .join('')
    .trim()
  return text === '' ? undefined : text
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
}

function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '[configured endpoint]'
  }
}

function safeVisionError(message: string): string {
  return message
    .replace(/https?:\/\/[^\s]+/gi, '[redacted endpoint]')
    .replace(/\b(?:api[-_ ]?key|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
    .replace(/\b(?:sk-|ck_(?:live|test)_)[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 240)
}

function envProvider(): VisionProvider | undefined {
  const value = process.env.COCODE_VISION_PROVIDER
  return value === 'user' || value === 'cocode' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function registerVisionCommand(ctx: RuntimeContext, service: CocodeVisionService): void {
  const commands = ctx.get<VisionCommandService>('commands')
  if (commands === undefined) return
  const register = () => commands.register({
    name: 'vision',
    description: 'Configure the image understanding provider and model',
    input: { hint: 'status | provider <cocode|user> | model <id> | endpoint <url> | credential <ref> | enable|disable' },
    handler: async ({ rawInput }) => {
      try {
        return { kind: 'success', text: await runVisionCommand(service, rawInput) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : 'vision command failed' }
      }
    },
  })
  if (ctx.effect === undefined) {
    register()
    return
  }
  ctx.effect(register, 'cocode-vision.command')
}

async function runVisionCommand(service: CocodeVisionService, rawInput: string): Promise<string> {
  const input = rawInput.trim()
  if (input === '' || input === 'status') return formatVisionStatus(await service.status())
  const [action, ...rest] = input.split(/\s+/u)
  const value = rest.join(' ').trim()
  if (action === 'provider') {
    if (value !== 'cocode' && value !== 'user') throw new Error('usage: /vision provider <cocode|user>')
    return formatVisionStatus(await service.configure({ provider: value }))
  }
  if (action === 'model') {
    if (value === '') throw new Error('usage: /vision model <model-id>')
    const status = await service.status()
    const field = status.provider === 'user' ? 'user' : 'cocode'
    return formatVisionStatus(await service.configure({ [field]: { model: value } }))
  }
  if (action === 'endpoint') {
    if (value === '') throw new Error('usage: /vision endpoint <url>')
    const status = await service.status()
    if (status.provider !== 'user') throw new Error('vision endpoint can only be changed for the user provider')
    return formatVisionStatus(await service.configure({ user: { endpoint: value } }))
  }
  if (action === 'credential') {
    if (value === '') throw new Error('usage: /vision credential <credential-ref>')
    const status = await service.status()
    const field = status.provider === 'user' ? 'user' : 'cocode'
    return formatVisionStatus(await service.configure({ [field]: { credentialRef: value } }))
  }
  if (action === 'enable' && value === '') return formatVisionStatus(await service.configure({ autoRead: true }))
  if (action === 'disable' && value === '') return formatVisionStatus(await service.configure({ autoRead: false }))
  throw new Error('usage: /vision [status|provider|model|endpoint|credential|enable|disable]')
}

function formatVisionStatus(status: VisionStatus): string {
  const state = !status.enabled ? 'disabled' : status.configured ? 'ready' : 'not configured'
  const endpoint = status.endpoint === undefined ? 'none' : status.endpoint
  return `vision: ${state}; provider=${status.provider}; model=${status.model || 'none'}; endpoint=${endpoint}${status.reason === undefined ? '' : `; ${status.reason}`}`
}
