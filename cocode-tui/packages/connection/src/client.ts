/**
 * HarnessClient adapter. Do not wrap DeepSeekHarness.run().
 */

import type {
  TuiCapabilitySnapshot,
  TuiApprovalAnswer,
  TuiApprovalRequest,
  SessionEvent,
  SkillEntry,
  TuiPromptMode,
  TuiSessionSummary,
  TuiRuntimeAdvertisement,
  TuiQuestionAnswer,
  TuiQuestionRequest,
  TuiInitialize,
  TuiLaunch,
  TuiNotification,
  TuiRuntime,
  TuiSessionOpenResult,
  TuiModelCatalog,
  TuiModelCatalogFailure,
  TuiModelProviderGroup,
  TuiImageAttachmentRef,
  TuiImageInput,
} from './types.ts'
import { fallbackCapabilitySnapshot, probeRuntimeCapabilities } from './capability.ts'

type SdkClient = typeof import('@deepseek-ai/dsh-sdk-client')
type HarnessClient = InstanceType<SdkClient['HarnessClient']>

export function createTuiRuntime(launch: TuiLaunch): TuiRuntime {
  return new SdkTuiRuntime(launch)
}

class SdkTuiRuntime implements TuiRuntime {
  private client: HarnessClient | undefined
  private launch: TuiLaunch
  private wire: 'unknown' | 'companion' | 'legacy' = 'unknown'
  private readonly handlers = new Set<(n: TuiNotification) => void>()
  private readonly closeHandlers = new Set<(error?: string) => void>()
  private pump: Promise<void> | undefined
  private subscription: { close(): void } | undefined
  private closing = false
  private questionHandler: ((request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>) | undefined
  private approvalHandler: ((request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>) | undefined
  private capabilitySnapshot: TuiCapabilitySnapshot = fallbackCapabilitySnapshot()

  constructor(launch: TuiLaunch) {
    this.launch = launch
  }

  async start(init: TuiInitialize): Promise<{
    name: string
    version: string
    capabilities?: import('./types.ts').TuiRuntimeAdvertisement
  }> {
    const { HarnessClient } = await import('@deepseek-ai/dsh-sdk-client')
    const client = new HarnessClient({
      command: this.launch.command,
      args: this.launch.args,
      cwd: this.launch.cwd,
      env: this.launch.env,
    })
    this.client = client
    this.closing = false
    this.wire = 'unknown'
    this.capabilitySnapshot = fallbackCapabilitySnapshot()
    try {
      client.start()
      const sub = client.subscribe()
      this.subscription = sub
      this.pump = this.readLoop(sub)
      const result = await client.initialize(init)
      const advertised = await this.negotiateWire(client)
      return {
        ...result.serverInfo,
        ...(advertised === undefined ? {} : { capabilities: advertised }),
      }
    } catch (error) {
      this.closing = true
      await this.close().catch(() => undefined)
      throw error
    }
  }

  async restart(
    init: TuiInitialize,
    env?: NodeJS.ProcessEnv,
  ): Promise<{
    name: string
    version: string
    capabilities?: import('./types.ts').TuiRuntimeAdvertisement
  }> {
    await this.close()
    this.closing = false
    this.client = undefined
    this.pump = undefined
    const previousLaunch = this.launch
    if (env !== undefined) {
      const sessionRoot = this.launch.env?.DSH_SESSION_ROOT
      this.launch = {
        ...this.launch,
        env: {
          ...env,
          ...(sessionRoot === undefined ? {} : { DSH_SESSION_ROOT: sessionRoot }),
        },
      }
    }
    try {
      return await this.start(init)
    } catch (error) {
      this.launch = previousLaunch
      throw error
    }
  }

  async prompt(
    sessionId: string,
    blocks: { type: string; text?: string }[],
    mode: TuiPromptMode = 'normal',
  ): Promise<string> {
    const client = this.requireClient()
    if (mode !== 'normal') {
      const modes = this.capabilitySnapshot.modes?.promptModes ?? []
      if (!modes.includes(mode))
        this.requireCapability(mode === 'queue' ? 'queueMode' : 'promptMode')
    }
    const result = await client.request('session/prompt', {
      sessionId,
      contentBlocks: blocks,
      ...(mode === 'normal' ? {} : { mode }),
    })
    if (!isRecord(result) || typeof result.messageId !== 'string') {
      throw new Error(`session/prompt returned no message id: ${JSON.stringify(result)}`)
    }
    return result.messageId
  }

  async cancel(sessionId: string, keepInbox = false): Promise<boolean> {
    const client = this.requireClient()
    this.requireCapability('cancel')
    const result = await client.request(
      this.wireMethod('cocode/session/cancel', 'session/cancel'),
      { sessionId, keepInbox },
    )
    if (!isRecord(result) || typeof result.cancelled !== 'boolean') {
      throw new Error(`session/cancel returned no cancellation result: ${JSON.stringify(result)}`)
    }
    return result.cancelled
  }

  async open(
    sessionId: string,
    replaceSessionId?: string,
  ): Promise<boolean | TuiSessionOpenResult> {
    const client = this.requireClient()
    this.requireCapability('open')
    const params = {
      sessionId,
      ...(replaceSessionId === undefined ? {} : { replaceSessionId }),
    }
    const result = await client.request(
      this.wireMethod('cocode/session/open', 'session/open'),
      params,
    )
    if (!isRecord(result) || typeof result.opened !== 'boolean') {
      throw new Error(`session/open returned no open result: ${JSON.stringify(result)}`)
    }
    if (!Array.isArray(result.seed)) return result.opened
    if (!result.seed.every(isSessionEvent)) {
      throw new Error(`session/open returned an invalid seed: ${JSON.stringify(result)}`)
    }
    return {
      opened: result.opened,
      seed: result.seed,
      ...(typeof result.seedLength === 'number' ? { seedLength: result.seedLength } : {}),
    }
  }

  async fork(
    sourceSessionId: string,
    boundary?: number,
    replaceSessionId?: string,
    rewindToMessageSeq?: number,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }> {
    const client = this.requireClient()
    this.requireCapability('fork')
    const result = await client.request(this.wireMethod('cocode/session/fork', 'session/fork'), {
      sourceSessionId,
      ...(boundary === undefined ? {} : { boundary }),
      ...(replaceSessionId === undefined ? {} : { replaceSessionId }),
      ...(rewindToMessageSeq === undefined ? {} : { rewindToMessageSeq }),
    })
    return parseSessionForkResult(result, 'fork')
  }

  async rewind(
    sourceSessionId: string,
    messageSeq: number,
    replaceSessionId?: string,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }> {
    const client = this.requireClient()
    this.requireCapability('rewind')
    const result = await client.request(this.wireMethod('cocode/session/fork', 'session/fork'), {
      sourceSessionId,
      rewindToMessageSeq: messageSeq,
      ...(replaceSessionId === undefined ? {} : { replaceSessionId }),
    })
    return parseSessionForkResult(result, 'rewind')
  }

  async listSkills(sessionId: string): Promise<SkillEntry[]> {
    const client = this.requireClient()
    this.requireCapability('skills')
    const result = await client.request(this.wireMethod('cocode/skills/list', 'skills/list'), {
      sessionId,
    })
    if (!isRecord(result) || !Array.isArray(result.skills)) {
      throw new Error(`skills/list returned no skill catalog: ${JSON.stringify(result)}`)
    }
    return parseSkillEntries(result.skills)
  }

  async listSessions(cwd?: string): Promise<TuiSessionSummary[]> {
    const client = this.requireClient()
    this.requireCapability('sessionList')
    const result = await client.request(
      this.wireMethod('cocode/session/list', 'session/list'),
      cwd === undefined ? {} : { cwd },
    )
    const rows = Array.isArray(result)
      ? result
      : isRecord(result) && Array.isArray(result.sessions)
      ? result.sessions
      : undefined
    if (rows === undefined)
      throw new Error(`session/list returned no session list: ${JSON.stringify(result)}`)
    return rows.map(parseSessionSummary)
  }

  async listModels(): Promise<TuiModelCatalog> {
    const client = this.requireClient()
    this.requireCapability('modelList')
    const result = await client.request(this.wireMethod('cocode/model/list', 'model/list'))
    return parseModelCatalogResult(result)
  }

  async saveImages(images: readonly TuiImageInput[]): Promise<TuiImageAttachmentRef[]> {
    const client = this.requireClient()
    this.requireCapability('imageAttachments')
    const result = await client.request('cocode/attachment/saveImages', {
      images: images.map((image) => ({
        data: Buffer.from(image.data).toString('base64'),
        mediaType: image.mediaType,
        ...(image.name === undefined ? {} : { name: image.name }),
      })),
    })
    if (!isRecord(result) || !Array.isArray(result.attachments)) {
      throw new Error(`attachment/saveImages returned an invalid result: ${JSON.stringify(result)}`)
    }
    return result.attachments.map(parseImageAttachmentRef)
  }

  async permissionMode(
    sessionId: string,
    mode?: string,
  ): Promise<{ mode: string; supportedModes: string[] }> {
    const client = this.requireClient()
    this.requireCapability('permissionMode')
    const result = await client.request(
      this.wireMethod('cocode/permission/mode', 'permission/mode'),
      {
        sessionId,
        ...(mode === undefined ? {} : { mode }),
      },
    )
    if (
      !isRecord(result) ||
      typeof result.mode !== 'string' ||
      !Array.isArray(result.supportedModes)
    ) {
      throw new Error(`permission/mode returned an invalid result: ${JSON.stringify(result)}`)
    }
    return {
      mode: result.mode,
      supportedModes: result.supportedModes.filter(
        (value): value is string => typeof value === 'string',
      ),
    }
  }

  async planMode(
    sessionId: string,
    active?: boolean,
  ): Promise<{ active: boolean; pending?: boolean }> {
    const client = this.requireClient()
    this.requireCapability('planMode')
    const result = await client.request(this.wireMethod('cocode/plan/mode', 'plan/mode'), {
      sessionId,
      ...(active === undefined ? {} : { active }),
    })
    if (!isRecord(result) || typeof result.active !== 'boolean') {
      throw new Error(`plan/mode returned an invalid result: ${JSON.stringify(result)}`)
    }
    return {
      active: result.active,
      ...(typeof result.pending === 'boolean' ? { pending: result.pending } : {}),
    }
  }

  onQuestion(handler: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>): () => void {
    this.questionHandler = handler
    return () => {
      if (this.questionHandler === handler) this.questionHandler = undefined
    }
  }

  onApproval(handler: (request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>): () => void {
    this.approvalHandler = handler
    return () => {
      if (this.approvalHandler === handler) this.approvalHandler = undefined
    }
  }

  getCapabilities(): TuiCapabilitySnapshot {
    return this.capabilitySnapshot
  }

  subscribe(handler: (n: TuiNotification) => void): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  onClose(handler: (error?: string) => void): () => void {
    this.closeHandlers.add(handler)
    return () => {
      this.closeHandlers.delete(handler)
    }
  }

  async close(): Promise<void> {
    this.closing = true
    this.subscription?.close()
    this.subscription = undefined
    await this.client?.close()
    await this.pump?.catch(() => undefined)
  }

  private requireClient(): HarnessClient {
    if (this.client === undefined) {
      throw new Error('TuiRuntime.start() has not run')
    }
    return this.client
  }

  private wireMethod(companion: string, legacy: string): string {
    return this.wire === 'companion' ? companion : legacy
  }

  private async negotiateWire(client: HarnessClient): Promise<TuiRuntimeAdvertisement | undefined> {
    try {
      const result = await client.request('cocode/capabilities', {}, 1_000)
      const companion = parseCompanionCapabilities(result)
      if (companion === undefined) throw new Error('invalid companion capability response')
      this.wire = 'companion'
      const advertised = parseRuntimeAdvertisement(companion)
      this.capabilitySnapshot = {
        source: 'runtime',
        capabilities: {
          cancel: true,
          open: true,
          fork: true,
          rewind: true,
          skills: companion.skills,
          onRequest: false,
          approval: companion.approval,
          permissionMode: companion.permissionMode,
          planMode: companion.planMode,
          sessionList: companion.sessionList,
          modelList: companion.modelList,
          imageAttachments: companion.imageAttachments,
          promptMode: companion.promptModes.includes('steer'),
          queueMode: companion.promptModes.includes('queue'),
        },
        modes: advertised,
        errors: {},
      }
      return advertised
    } catch (error) {
      if (!isUnsupportedCompanionError(error)) throw error
      this.wire = 'legacy'
      const request = (method: string, params: object, timeoutMs?: number) =>
        client.request(method, params, timeoutMs)
      const advertised = undefined
      this.capabilitySnapshot = await probeRuntimeCapabilities(
        { request },
        { onRequest: false, advertised },
      )
      return advertised
    }
  }

  private requireCapability(name: keyof TuiCapabilitySnapshot['capabilities']): void {
    if (this.capabilitySnapshot.capabilities[name]) return
    const detail = this.capabilitySnapshot.errors[name]
    throw new Error(
      detail === undefined
        ? `runtime capability "${name}" is unavailable`
        : `runtime capability "${name}" is unavailable: ${detail}`,
    )
  }

  private async readLoop(
    sub: AsyncIterable<{ method: string; params: Record<string, unknown> }>,
  ): Promise<void> {
    let errorMessage: string | undefined
    try {
      for await (const notification of sub) {
        if (notification.method === 'cocode/question/request') {
          void this.respondToQuestion(notification.params)
          continue
        }
        if (notification.method === 'cocode/approval/request') {
          void this.respondToApproval(notification.params)
          continue
        }
        const mapped = mapNotification(notification)
        if (mapped === undefined) continue
        for (const handler of this.handlers) handler(mapped)
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
    } finally {
      if (!this.closing) {
        for (const handler of this.closeHandlers) handler(errorMessage)
      }
    }
  }

  private async respondToQuestion(params: Record<string, unknown>): Promise<void> {
    const requestId = params.requestId
    if (typeof requestId !== 'string') return
    let response: { answer: TuiQuestionAnswer } | { cancelled: true }
    try {
      const handler = this.questionHandler
      if (handler === undefined) throw new Error('TUI has no question handler')
      response = { answer: await handler(parseQuestionRequest(params)) }
    } catch {
      // A rejected UI handler means that the user cancelled the interaction.
      // Send that outcome explicitly instead of fabricating an empty answer,
      // which would fail normal question-batch validation.
      response = { cancelled: true }
    }
    await this.requireClient()
      .request('cocode/question/respond', { requestId, ...response })
      .catch(() => undefined)
  }

  private async respondToApproval(params: Record<string, unknown>): Promise<void> {
    const requestId = params.requestId
    if (typeof requestId !== 'string') return
    let outcome: TuiApprovalAnswer = { outcome: 'unavailable' }
    try {
      const handler = this.approvalHandler
      if (handler !== undefined) outcome = await handler(parseApprovalRequest(params))
    } catch {
      outcome = { outcome: 'unavailable' }
    }
    await this.requireClient()
      .request('cocode/approval/respond', { requestId, outcome: outcome.outcome })
      .catch(() => undefined)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type CompanionCapabilities = {
  protocolVersion: number
  promptModes: TuiPromptMode[]
  approval: boolean
  permissionMode: boolean
  planMode: boolean
  sessionList: boolean
  modelList: boolean
  imageAttachments: boolean
  interactions: 'notification-response'
  checkpoint: false
  skills: boolean
}

function parseCompanionCapabilities(value: unknown): CompanionCapabilities | undefined {
  if (!isRecord(value) || value.protocolVersion !== 1) return undefined
  if (
    value.interactions !== 'notification-response' ||
    value.checkpoint !== false ||
    !Array.isArray(value.promptModes)
  ) {
    return undefined
  }
  const promptModes = value.promptModes.filter(
    (mode): mode is TuiPromptMode => mode === 'normal' || mode === 'queue' || mode === 'steer',
  )
  if (!promptModes.includes('normal')) return undefined
  if (
    typeof value.approval !== 'boolean' ||
    typeof value.permissionMode !== 'boolean' ||
    typeof value.planMode !== 'boolean' ||
    typeof value.sessionList !== 'boolean' ||
    (value.modelList !== undefined && typeof value.modelList !== 'boolean')
    || (value.imageAttachments !== undefined && typeof value.imageAttachments !== 'boolean')
  ) {
    return undefined
  }
  return {
    protocolVersion: 1,
    promptModes,
    approval: value.approval,
    permissionMode: value.permissionMode,
    planMode: value.planMode,
    sessionList: value.sessionList,
    modelList: value.modelList === true,
    imageAttachments: value.imageAttachments === true,
    interactions: 'notification-response',
    checkpoint: false,
    skills: value.skills === true,
  }
}

function isUnsupportedCompanionError(error: unknown): boolean {
  if (isRecord(error) && error.code === -32601) return true
  const message = error instanceof Error ? error.message : String(error)
  return /unknown(?: [^\n]*)? method|method not found|unsupported method|not implemented/i.test(
    message,
  )
}

function isForkResult(
  value: unknown,
): value is { sessionId: string; seedLength: number; seed: SessionEvent[] } {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.seedLength === 'number' &&
    Number.isSafeInteger(value.seedLength) &&
    value.seedLength >= 0 &&
    Array.isArray(value.seed) &&
    value.seed.every(isSessionEvent)
  )
}

function parseSessionForkResult(
  value: unknown,
  operation: 'fork' | 'rewind',
): { sessionId: string; seedLength: number; seed: SessionEvent[] } {
  if (!isForkResult(value)) {
    throw new Error(`session/fork returned no ${operation} result: ${JSON.stringify(value)}`)
  }
  return {
    sessionId: value.sessionId,
    seedLength: value.seedLength,
    seed: value.seed,
  }
}

function parseSkillEntries(value: unknown[]): SkillEntry[] {
  const skills: SkillEntry[] = []
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.name !== 'string' ||
      typeof entry.description !== 'string'
    ) {
      throw new Error(`skills/list returned an invalid skill entry: ${JSON.stringify(entry)}`)
    }
    skills.push({
      name: entry.name,
      description: entry.description,
      ...(typeof entry.whenToUse === 'string' ? { whenToUse: entry.whenToUse } : {}),
      ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
    })
  }
  return skills
}

function parseRuntimeAdvertisement(value: Record<string, unknown>): TuiRuntimeAdvertisement {
  const promptModes: TuiPromptMode[] = Array.isArray(value.promptModes)
    ? value.promptModes.filter(
        (mode): mode is TuiPromptMode => mode === 'normal' || mode === 'queue' || mode === 'steer',
      )
    : ['normal']
  return {
    promptModes,
    approval: value.approval === true,
    permissionMode: value.permissionMode === true,
    planMode: value.planMode === true,
    sessionList: value.sessionList === true,
    modelList: value.modelList === true,
    imageAttachments: value.imageAttachments === true,
    checkpoint: false,
  }
}

function parseImageAttachmentRef(value: unknown): TuiImageAttachmentRef {
  if (
    !isRecord(value) ||
    typeof value.attachmentId !== 'string' ||
    !isImageMediaType(value.mediaType) ||
    !isNonnegativeInteger(value.bytes) ||
    !isNonnegativeInteger(value.width) ||
    !isNonnegativeInteger(value.height) ||
    (value.name !== undefined && typeof value.name !== 'string')
  ) {
    throw new Error(`attachment/saveImages returned an invalid attachment: ${JSON.stringify(value)}`)
  }
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(value.name === undefined ? {} : { name: value.name }),
  }
}

function isImageMediaType(value: unknown): value is TuiImageAttachmentRef['mediaType'] {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parseModelCatalogResult(value: unknown): TuiModelCatalog {
  if (!isRecord(value) || !Array.isArray(value.groups) || !Array.isArray(value.failures)) {
    throw new Error('model/list returned an invalid catalog')
  }
  const groups: TuiModelProviderGroup[] = value.groups.map((group) => {
    if (
      !isRecord(group) ||
      typeof group.id !== 'string' ||
      typeof group.name !== 'string' ||
      !Array.isArray(group.models)
    ) {
      throw new Error('model/list returned an invalid provider group')
    }
    return {
      id: group.id,
      name: group.name,
      models: group.models.map((model) => {
        if (
          !isRecord(model) ||
          typeof model.id !== 'string' ||
          typeof model.name !== 'string' ||
          (model.description !== undefined && typeof model.description !== 'string')
        ) {
          throw new Error('model/list returned an invalid model entry')
        }
        return {
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
        }
      }),
    }
  })
  const failures: TuiModelCatalogFailure[] = value.failures.map((failure) => {
    if (
      !isRecord(failure) ||
      typeof failure.id !== 'string' ||
      typeof failure.name !== 'string' ||
      typeof failure.message !== 'string'
    ) {
      throw new Error('model/list returned an invalid provider failure')
    }
    return { id: failure.id, name: failure.name, message: failure.message }
  })
  return { groups, failures }
}

function parseApprovalRequest(params: Record<string, unknown>): TuiApprovalRequest {
  if (typeof params.sessionId !== 'string' || typeof params.toolName !== 'string') {
    throw new Error('invalid approval/request')
  }
  return {
    sessionId: params.sessionId,
    toolName: params.toolName,
    ...(typeof params.callId === 'string' ? { callId: params.callId } : {}),
    ...(typeof params.reason === 'string' ? { reason: params.reason } : {}),
    ...(typeof params.target === 'string' ? { target: params.target } : {}),
    ...(typeof params.risk === 'string' ? { risk: params.risk } : {}),
    ...(typeof params.source === 'string' ? { source: params.source } : {}),
  }
}

function parseSessionSummary(value: unknown): TuiSessionSummary {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== 'string' ||
    typeof value.createdAt !== 'number'
  ) {
    throw new Error(`session/list returned an invalid session: ${JSON.stringify(value)}`)
  }
  return {
    sessionId: value.sessionId,
    createdAt: value.createdAt,
    ...(typeof value.updatedAt === 'number' ? { updatedAt: value.updatedAt } : {}),
    ...(typeof value.cwd === 'string' ? { cwd: value.cwd } : {}),
    ...(typeof value.parentSessionId === 'string'
      ? { parentSessionId: value.parentSessionId }
      : {}),
    ...(typeof value.seedLength === 'number' ? { seedLength: value.seedLength } : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.eventCount === 'number' ? { eventCount: value.eventCount } : {}),
  }
}

function mapNotification(notification: {
  method: string
  params: Record<string, unknown>
}): TuiNotification | undefined {
  const params = notification.params
  if (notification.method === 'session.event') {
    const sessionId = params.sessionId
    const event = params.event
    if (typeof sessionId !== 'string' || !isSessionEvent(event)) return undefined
    return { method: 'session.event', params: { sessionId, event } }
  }
  if (notification.method === 'session.status') {
    const sessionId = params.sessionId
    const status = params.status
    if (typeof sessionId !== 'string') return undefined
    if (status !== 'idle' && status !== 'running') return undefined
    return { method: 'session.status', params: { sessionId, status } }
  }
  if (notification.method === 'subagent.started') {
    const parentSessionId = params.parentSessionId
    const childSessionId = params.childSessionId
    if (typeof parentSessionId !== 'string' || typeof childSessionId !== 'string') {
      return undefined
    }
    return {
      method: 'subagent.started',
      params: { parentSessionId, childSessionId },
    }
  }
  if (notification.method === 'subagent.finished') {
    const parentSessionId = params.parentSessionId
    const childSessionId = params.childSessionId
    const provider = params.provider
    const agentId = params.agentId
    const status = params.status
    if (
      typeof parentSessionId !== 'string' ||
      typeof childSessionId !== 'string' ||
      typeof provider !== 'string' ||
      typeof agentId !== 'string' ||
      typeof status !== 'string'
    ) {
      return undefined
    }
    return {
      method: 'subagent.finished',
      params: { provider, agentId, parentSessionId, childSessionId, status },
    }
  }
  return undefined
}

function isSessionEvent(value: unknown): value is SessionEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Record<string, unknown>
  return (
    typeof event.type === 'string' &&
    typeof event.seq === 'number' &&
    typeof event.time === 'number'
  )
}

function parseQuestionRequest(params: Record<string, unknown>): TuiQuestionRequest {
  if (typeof params.sessionId !== 'string' || !Array.isArray(params.questions)) {
    throw new Error('invalid question/ask request')
  }
  const questions = params.questions.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('invalid question item')
    }
    const item = value as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.question !== 'string') {
      throw new Error('invalid question item')
    }
    const options = item.options === undefined ? undefined : parseQuestionOptions(item.options)
    const intent = item.intent === undefined ? undefined : parseQuestionIntent(item.intent)
    return {
      id: item.id,
      question: item.question,
      ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
      ...(typeof item.header === 'string' ? { header: item.header } : {}),
      ...(options === undefined ? {} : { options }),
      ...(typeof item.multiSelect === 'boolean' ? { multiSelect: item.multiSelect } : {}),
      ...(intent === undefined ? {} : { intent }),
    }
  })
  if (questions.length === 0) throw new Error('question/ask requires at least one question')
  return { sessionId: params.sessionId, questions }
}

function parseQuestionIntent(value: unknown): { kind: 'plan-review'; approve: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid question intent')
  }
  const intent = value as Record<string, unknown>
  if (intent.kind !== 'plan-review' || typeof intent.approve !== 'string') {
    throw new Error('invalid question intent')
  }
  return { kind: intent.kind, approve: intent.approve }
}

function parseQuestionOptions(value: unknown): { label: string; description?: string }[] {
  if (!Array.isArray(value)) throw new Error('invalid question options')
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('invalid question option')
    }
    const option = entry as Record<string, unknown>
    if (typeof option.label !== 'string') throw new Error('invalid question option')
    return {
      label: option.label,
      ...(typeof option.description === 'string' ? { description: option.description } : {}),
    }
  })
}
