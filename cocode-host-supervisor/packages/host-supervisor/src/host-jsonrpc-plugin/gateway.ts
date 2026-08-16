import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { CompanionTransport } from './transport.js'
import type {
  Agent,
  AgentHandle,
  CommandDescriptor,
  CommandExecution,
  CompanionCapabilities,
  ContentBlock,
  ImageAttachmentRef,
  ImageMediaType,
  InitializeParams,
  PromptParams,
  RuntimeContext,
  SessionEvent,
  UserMessage,
  PluginEntry,
  PluginFiberPhase,
} from './types.js'

type SessionRecord = { handle: AgentHandle; seed?: SessionEvent[]; owned: boolean }

type UserQuestion = {
  id: string
  question: string
  detail?: string
  header?: string
  options?: { label: string; description?: string }[]
  multiSelect?: boolean
  intent?: { kind: 'plan-review'; approve: string }
}

type UserQuestionAnswer = {
  id: string
  selected: string[]
  custom?: string
}

type UserQuestionsService = {
  registerProvider(provider: {
    ask(request: {
      agent?: Agent
      questions: UserQuestion[]
      signal?: AbortSignal
    }): Promise<{ answers: UserQuestionAnswer[] }>
  }): () => void
}

type ApprovalRequest = {
  agent: Agent
  toolName: string
  callId?: string
  reason?: string
  signal?: AbortSignal
  [key: string]: unknown
}

type PermissionService = {
  names: readonly string[]
  current(events: readonly SessionEvent[]): string
  set(session: Agent['session'], name: string): void
}
type PlanService = {
  get(agent: Agent): { active: boolean; pending?: boolean }
  set(agent: Agent, active: boolean): string
}
type SkillService = {
  list(options?: { cwd?: string; scope?: Agent }): Promise<
    readonly {
      name: string
      description: string
      whenToUse?: string
      source?: string
      invocation?: { userInvocable?: boolean }
    }[]
  >
}
type CommandService = {
  list(agent: Agent): readonly CommandDescriptor[]
  execute(agent: Agent, line: string, signal: AbortSignal): Promise<CommandExecution | undefined>
}
type LoaderEntry = {
  id: string
  disabled?: boolean
  options?: { group?: boolean; name?: string }
  fiber?: { state?: unknown }
  update?(options: { disabled?: boolean }): Promise<void>
}
type LoaderService = {
  entries(): Iterable<LoaderEntry>
}
type LlmService = {
  listProviders(): readonly { id: string; name?: string }[]
  listModels(provider: string): Promise<
    readonly {
      id: string
      name?: string
      description?: string
      inputModalities?: readonly string[]
    }[]
  >
  resolveModelInfo?: (provider: string, model: string) => Promise<{
    inputModalities?: readonly string[]
  }>
}
type AttachmentService = {
  imageLimits: {
    maxImageBytes: number
    maxImagesPerMessage: number
    maxMessageImageBytes: number
    mediaTypes: readonly ImageMediaType[]
  }
  validateImage(input: {
    data: Uint8Array
    mediaType: ImageMediaType
    name?: string
  }): Promise<void>
  saveImage(input: {
    data: Uint8Array
    mediaType: ImageMediaType
    name?: string
  }): Promise<ImageAttachmentRef>
}
type PersistenceService = {
  list(): Promise<
    readonly {
      id: string
      createdAt: number
      cwd?: string
      parentSession?: string
      seedLength?: number
    }[]
  >
  inspect(id: string): Promise<{
    meta: {
      id: string
      createdAt: number
      cwd?: string
      parentSession?: string
      seedLength?: number
    }
    events: SessionEvent[]
  }>
}

type PendingQuestion = {
  questions: UserQuestion[]
  resolve: (answer: { answers: UserQuestionAnswer[] }) => void
  reject: (error: Error) => void
}
type PendingApproval = {
  resolve: (outcome: ApprovalOutcome) => void
  reject: (error: Error) => void
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

type ApprovalOutcome =
  | 'allowed-once'
  | 'allowed-for-turn'
  | 'rejected'
  | 'cancelled'
  | 'unavailable'

/** Cocode-owned stdio gateway. It consumes Harness services without importing Harness runtime packages. */
export class TuiCompanionGateway {
  private cwd = process.cwd()
  private provider = 'deepseek-official'
  private model = 'deepseek-official'
  private maxTokens: number | undefined
  private initialized = false
  private shuttingDown = false
  private shutdownTask: Promise<Record<string, never>> | undefined
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly sessionCreations = new Map<string, Promise<SessionRecord>>()
  private readonly sessionOpenings = new Map<string, Promise<SessionRecord>>()
  private readonly pendingPermissionModes = new Map<string, Promise<SessionRecord>>()
  private readonly pendingPlanModes = new Map<string, Promise<SessionRecord>>()
  private readonly turnAllowances = new Map<string, { turn: number; tools: Set<string> }>()
  private readonly pendingQuestions = new Map<string, PendingQuestion>()
  private readonly pendingApprovals = new Map<string, PendingApproval>()
  private readonly disposers: (() => void)[] = []
  private questionDisposer: (() => void) | undefined
  private approvalDisposer: (() => void) | undefined

  constructor(
    private readonly ctx: RuntimeContext,
    private readonly transport: CompanionTransport,
    options: { registerQuestionProvider?: boolean } = {},
  ) {
    this.disposers.push(
      ctx.on('session/event', (session: Agent['session'], event: SessionEvent) => {
        if (event.type === 'turn/start' || event.type === 'turn/end') {
          this.turnAllowances.delete(String(session.id))
        }
        transport.notify('session.event', { sessionId: String(session.id), event })
      }),
    )
    this.disposers.push(
      ctx.on('agent/status', ({ agent, status }: { agent: Agent; status: Agent['status'] }) => {
        transport.notify('session.status', { sessionId: String(agent.session.id), status })
      }),
    )
    this.disposers.push(
      ctx.on('session/created', (session: Agent['session']) => {
        const parentSession = session.header.parentSession
        if (parentSession === undefined) return
        transport.notify('subagent.started', {
          parentSessionId: String(parentSession),
          childSessionId: String(session.id),
        })
      }),
    )
    this.approvalDisposer = this.registerApprovalProvider()
    if (options.registerQuestionProvider !== false) this.tryRegisterQuestionProvider()
  }

  /** Register optional question provider when the service is already mounted. */
  tryRegisterQuestionProvider(): void {
    if (this.questionDisposer !== undefined) return
    const service = this.ctx.get('userQuestions') as UserQuestionsService | undefined
    if (service === undefined) return
    try {
      this.questionDisposer = service.registerProvider({
        ask: (request) => this.askQuestion(request),
      })
    } catch (error) {
      // The web profile may already own the process-wide question provider.
      // A second JSON-RPC client must not crash the shared Host merely because
      // that provider is unavailable for this transport.
      if ((error as { code?: unknown })?.code !== 'DUPLICATE_PROVIDER') throw error
    }
  }

  /** Remove the question provider owned by this gateway. */
  unregisterQuestionProvider(): void {
    this.questionDisposer?.()
    this.questionDisposer = undefined
  }

  private registerApprovalProvider(): (() => void) | undefined {
    if (this.ctx.get('approval') === undefined) return undefined
    return this.ctx.on(
      'approval/request',
      (request: ApprovalRequest, next: () => Promise<string>) => {
        const sessionId = String(request.agent.session.id)
        if (!this.sessions.has(sessionId)) return next()
        const turn = openTurnOf(request.agent.session.events)
        if (turn !== undefined && this.hasTurnAllowance(sessionId, request.toolName, turn)) {
          return Promise.resolve('allowed-once')
        }
        return this.askApproval(request, turn)
      },
    )
  }

  /** Advertise only services that are actually present in this composition. */
  capabilities(): CompanionCapabilities {
    const llm = this.ctx.get('llm') as
      | { listProviders?: unknown; listModels?: unknown }
      | undefined
    return {
      protocolVersion: 1,
      promptModes: ['normal', 'queue', 'steer'],
      skills: this.ctx.get('skills') !== undefined,
      modelList: typeof llm?.listProviders === 'function' && typeof llm.listModels === 'function',
      imageAttachments: this.ctx.get('attachments') !== undefined,
      approval: this.ctx.get('approval') !== undefined,
      permissionMode: this.ctx.get('permissionPresets') !== undefined,
      planMode: this.ctx.get('planMode') !== undefined,
      sessionList: this.ctx.get('sessionPersistence') !== undefined,
      commands: this.ctx.get('commands') !== undefined,
      plugins: this.ctx.get('loader') !== undefined,
      pluginsMutate: this.ctx.get('loader') !== undefined,
      interactions: 'notification-response',
      checkpoint: false,
    }
  }

  async initialize(params: InitializeParams): Promise<{
    serverInfo: { name: string; version: string }
    capabilities: CompanionCapabilities
  }> {
    if (
      params.maxTokens !== undefined &&
      (!Number.isSafeInteger(params.maxTokens) || params.maxTokens <= 0)
    ) {
      throw new TypeError('initialize maxTokens must be a positive safe integer')
    }
    this.cwd = resolve(params.cwd)
    this.provider = params.provider
    this.model = params.model
    this.maxTokens = params.maxTokens
    this.initialized = true
    const llm = this.ctx.get('llm') as
      | { listProviders?: () => readonly { id: string }[] }
      | undefined
    if (
      llm?.listProviders !== undefined &&
      !llm.listProviders().some((entry) => entry.id === this.provider)
    ) {
      throw new Error(`no adapter registered for provider "${this.provider}"`)
    }
    return {
      serverInfo: { name: 'cocode-tui-companion', version: '0.1.0' },
      capabilities: this.capabilities(),
    }
  }

  async prompt(params: PromptParams): Promise<{ messageId: string }> {
    this.assertInitialized()
    const contentBlocks = await this.preparePromptBlocks(params.contentBlocks)
    const record = await this.getOrCreateSession(params.sessionId)
    this.assertLive(params.sessionId, record)
    const message = createUserMessage(contentBlocks, params.contentBlocks)
    switch (params.mode ?? 'normal') {
      case 'normal':
      case 'queue':
        record.handle.agent.followup(message)
        break
      case 'steer':
        record.handle.agent.steer(message)
        break
      default:
        throw new Error(`session/prompt has unsupported mode: ${String(params.mode)}`)
    }
    return { messageId: message.id }
  }

  private async preparePromptBlocks(blocks: readonly ContentBlock[]): Promise<ContentBlock[]> {
    if (!blocks.some((block) => block.type === 'image')) return [...blocks]
    if (await this.modelSupportsImages()) return [...blocks]

    const vision = this.ctx.get('cocodeVision') as
      | {
          prepareBlocks(
            blocks: readonly ContentBlock[],
            options?: { preserveImages?: boolean },
          ): Promise<ContentBlock[]>
        }
      | undefined
    if (vision === undefined) {
      throw new Error(
        'The selected model does not support image content, and the Cocode vision bridge is unavailable.',
      )
    }
    const prepared = await vision.prepareBlocks(blocks, { preserveImages: false })
    if (prepared.some((block) => block.type === 'image')) {
      throw new Error(
        'The selected model does not support image content, and the Cocode vision bridge is not configured.',
      )
    }
    return prepared
  }

  private async modelSupportsImages(): Promise<boolean> {
    const llm = this.ctx.get('llm') as LlmService | undefined
    if (llm?.resolveModelInfo !== undefined) {
      try {
        const model = await llm.resolveModelInfo(this.provider, this.model)
        return model.inputModalities?.includes('image') === true
      } catch {
        return false
      }
    }
    if (llm === undefined) return false
    try {
      const models = await llm.listModels(this.provider)
      return models.some(
        (model) => model.id === this.model && model.inputModalities?.includes('image') === true,
      )
    } catch {
      return false
    }
  }

  async saveImages(params: Record<string, unknown>): Promise<{ attachments: ImageAttachmentRef[] }> {
    this.assertInitialized()
    const store = this.ctx.get('attachments') as AttachmentService | undefined
    if (store === undefined) {
      throw new Error('image attachment capability is unavailable: attachment storage is not configured')
    }
    if (!Array.isArray(params.images) || params.images.length === 0) {
      throw new TypeError('attachment/saveImages requires at least one image')
    }
    if (params.images.length > store.imageLimits.maxImagesPerMessage) {
      throw new Error(`image count exceeds ${store.imageLimits.maxImagesPerMessage}`)
    }
    const images = params.images.map((image, index) =>
      parseImageInput(image, index, store.imageLimits.maxImageBytes, store.imageLimits.mediaTypes),
    )
    const totalBytes = images.reduce((total, image) => total + image.data.byteLength, 0)
    if (totalBytes > store.imageLimits.maxMessageImageBytes) {
      throw new Error(`image bytes exceed ${store.imageLimits.maxMessageImageBytes}`)
    }
    await Promise.all(images.map((image) => store.validateImage(image)))
    return { attachments: await Promise.all(images.map((image) => store.saveImage(image))) }
  }

  async listSessions(
    params: { cwd?: string } = {},
  ): Promise<{ sessions: Record<string, unknown>[] }> {
    const persistence = this.ctx.get('sessionPersistence') as PersistenceService | undefined
    if (persistence === undefined)
      throw new Error(
        'session/list capability is unavailable: session persistence is not configured',
      )
    const cwd = resolve(params.cwd ?? this.cwd)
    const headers = (await persistence.list()).filter((header) => header.cwd === cwd)
    const sessions = await Promise.all(
      headers.map(async (header) => {
        const inspection = await persistence.inspect(header.id)
        const last = inspection.events.at(-1)
        const title = readSessionTitle(inspection.events)
        return {
          sessionId: String(header.id),
          createdAt: header.createdAt,
          ...(last === undefined ? {} : { updatedAt: last.time }),
          ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
          ...(header.parentSession === undefined
            ? {}
            : { parentSessionId: String(header.parentSession) }),
          ...(header.seedLength === undefined ? {} : { seedLength: header.seedLength }),
          ...(title === undefined ? {} : { title }),
          eventCount: inspection.events.length,
        }
      }),
    )
    return { sessions }
  }

  async permissionMode(params: { sessionId: string; mode?: string }): Promise<{
    mode: string
    supportedModes: string[]
  }> {
    this.assertInitialized()
    const service = this.ctx.get('permissionPresets') as PermissionService | undefined
    if (service === undefined)
      throw new Error(
        'permission/mode capability is unavailable: permission presets are not configured',
      )

    const existing = this.sessions.get(params.sessionId)
    const pending = this.sessionCreations.get(params.sessionId)
    const opening = this.sessionOpenings.get(params.sessionId)
    if (
      existing === undefined &&
      pending === undefined &&
      opening === undefined &&
      params.mode === undefined
    ) {
      return { mode: service.current([]), supportedModes: [...service.names] }
    }

    if (params.mode === undefined) {
      await this.pendingPermissionModes.get(params.sessionId)
      const record =
        existing === undefined
          ? await this.getOrCreateSession(params.sessionId)
          : this.assertLive(params.sessionId, existing)
      return {
        mode: service.current(record.handle.agent.session.events),
        supportedModes: [...service.names],
      }
    }

    const change = (async () => {
      const record =
        existing === undefined
          ? await this.getOrCreateSession(params.sessionId)
          : this.assertLive(params.sessionId, existing)
      service.set(record.handle.agent.session, params.mode as string)
      return record
    })()
    {
      this.pendingPermissionModes.set(params.sessionId, change)
      try {
        const record = await change
        return {
          mode: service.current(record.handle.agent.session.events),
          supportedModes: [...service.names],
        }
      } finally {
        if (this.pendingPermissionModes.get(params.sessionId) === change)
          this.pendingPermissionModes.delete(params.sessionId)
      }
    }
  }

  async planMode(params: { sessionId: string; active?: boolean }): Promise<{
    active: boolean
    pending?: boolean
  }> {
    this.assertInitialized()
    const service = this.ctx.get('planMode') as PlanService | undefined
    if (service === undefined)
      throw new Error('plan/mode capability is unavailable: plan mode is not configured')

    const existing = this.sessions.get(params.sessionId)
    const pending = this.sessionCreations.get(params.sessionId)
    const opening = this.sessionOpenings.get(params.sessionId)
    if (
      existing === undefined &&
      pending === undefined &&
      opening === undefined &&
      params.active !== true
    ) {
      return { active: false }
    }

    if (params.active === undefined) {
      await this.pendingPlanModes.get(params.sessionId)
      const record =
        existing === undefined
          ? await this.getOrCreateSession(params.sessionId)
          : this.assertLive(params.sessionId, existing)
      return service.get(record.handle.agent)
    }

    const change = (async () => {
      const record =
        existing === undefined
          ? await this.getOrCreateSession(params.sessionId)
          : this.assertLive(params.sessionId, existing)
      service.set(record.handle.agent, params.active as boolean)
      return record
    })()
    {
      this.pendingPlanModes.set(params.sessionId, change)
      try {
        const record = await change
        return service.get(record.handle.agent)
      } finally {
        if (this.pendingPlanModes.get(params.sessionId) === change)
          this.pendingPlanModes.delete(params.sessionId)
      }
    }
  }

  cancel(params: { sessionId: string; keepInbox?: boolean }): { cancelled: boolean } {
    const record = this.requireSession(params.sessionId)
    const wasRunning = record.handle.agent.status === 'running'
    record.handle.agent.cancel({ kind: 'user' }, { keepInbox: params.keepInbox === true })
    return { cancelled: wasRunning }
  }

  async open(params: {
    sessionId: string
    replaceSessionId?: string
  }): Promise<Record<string, unknown>> {
    this.assertInitialized()
    if (this.shuttingDown) throw new Error('companion is shutting down')
    const existing = this.sessions.get(params.sessionId)
    if (existing !== undefined) return { opened: false }
    const pending = this.sessionOpenings.get(params.sessionId)
    if (pending !== undefined) {
      await pending
      return { opened: false }
    }
    const live = this.ctx.agents.get(params.sessionId)
    if (live !== undefined) {
      const record = this.borrowSession(live)
      this.sessions.set(params.sessionId, record)
      await this.replaceSession(params.replaceSessionId, params.sessionId)
      return { opened: true, seed: [...live.session.events], seedLength: live.session.events.length }
    }
    const opening = this.resumeSession(params.sessionId)
    this.sessionOpenings.set(params.sessionId, opening)
    try {
      const record = await opening
      this.sessions.set(params.sessionId, record)
      await this.replaceSession(params.replaceSessionId, params.sessionId)
      return { opened: true, seed: record.seed ?? [], seedLength: record.seed?.length ?? 0 }
    } finally {
      if (this.sessionOpenings.get(params.sessionId) === opening)
        this.sessionOpenings.delete(params.sessionId)
    }
  }

  async fork(params: {
    sourceSessionId: string
    boundary?: number
    rewindToMessageSeq?: number
    childSessionId?: string
    replaceSessionId?: string
  }): Promise<Record<string, unknown>> {
    this.assertInitialized()
    if (this.shuttingDown) throw new Error('companion is shutting down')
    const source = this.requireSession(params.sourceSessionId)
    if (source.handle.agent.status === 'running') {
      source.handle.agent.cancel({ kind: 'user' })
      await source.handle.agent.whenIdle()
    }
    const boundary = resolveForkBoundary(source.handle.agent.session.events, params)
    const seed = this.ctx.sessions.forkSeed(source.handle.agent.session, boundary)
    const sessionId = params.childSessionId ?? `session-${randomUUID().replaceAll('-', '')}`
    if (this.ctx.agents.get(sessionId) !== undefined)
      throw new Error(`session "${sessionId}" already exists`)
    const handle = await this.ctx.agents.create({
      sessionId,
      seed,
      meta: {
        cwd: this.cwd,
        parentSession: source.handle.agent.session.id,
        seedLength: seed.length,
      },
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...(this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens }),
      },
    })
    this.sessions.set(sessionId, { handle, owned: true })
    await this.replaceSession(params.replaceSessionId, sessionId)
    return { sessionId, seedLength: seed.length, seed: [...seed] }
  }

  async listSkills(params: { sessionId: string }): Promise<{ skills: Record<string, unknown>[] }> {
    if (params.sessionId.trim() === '') throw new Error('skills/list requires a session id')
    const registry = this.ctx.get('skills') as SkillService | undefined
    if (registry === undefined) throw new Error('skills registry is not configured')
    const record = await this.getOrCreateSession(params.sessionId)
    this.assertLive(params.sessionId, record)
    const agent = record.handle.agent
    const skills = await registry.list({
      cwd: agent.session.header.cwd ?? this.cwd,
      scope: agent,
    })
    return {
      skills: skills
        .filter((skill) => skill.invocation?.userInvocable !== false)
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
          ...(skill.source === undefined ? {} : { source: skill.source }),
        })),
    }
  }

  async listCommands(params: { sessionId: string }): Promise<{ commands: CommandDescriptor[] }> {
    if (params.sessionId.trim() === '') throw new Error('commands/list requires a session id')
    const registry = this.ctx.get('commands') as CommandService | undefined
    if (registry === undefined) throw new Error('commands registry is not configured')
    const record = await this.getOrCreateSession(params.sessionId)
    this.assertLive(params.sessionId, record)
    return { commands: [...registry.list(record.handle.agent)] }
  }

  listPlugins(): { plugins: PluginEntry[] } {
    const loader = this.ctx.get('loader') as LoaderService | undefined
    if (loader === undefined) throw new Error('plugins/list capability is unavailable: loader is not configured')
    const plugins = [...loader.entries()]
      .filter((entry) => entry.options?.group !== true)
      .map((entry) => ({
        entryId: String(entry.id),
        moduleName: entry.options?.name ?? '',
        enabled: entry.disabled !== true,
        fiberPhase: pluginFiberPhase(entry.fiber?.state),
      }))
      .filter((entry) => entry.moduleName !== '')
    return { plugins }
  }

  async setPluginEnabled(params: { entryId: string; enabled: boolean }): Promise<PluginEntry> {
    const loader = this.ctx.get('loader') as LoaderService | undefined
    if (loader === undefined) throw new Error('plugins/set-enabled capability is unavailable: loader is not configured')
    if (params.entryId.trim() === '') throw new Error('plugins/set-enabled requires an entry id')
    const entry = [...loader.entries()].find((candidate) => candidate.id === params.entryId)
    if (entry === undefined || entry.options?.group === true || entry.options?.name === undefined) {
      throw new Error(`plugin entry not found: ${params.entryId}`)
    }
    if (entry.update === undefined) throw new Error('plugins/set-enabled is unavailable for this Loader')
    await entry.update({ disabled: !params.enabled })
    return {
      entryId: String(entry.id),
      moduleName: entry.options.name,
      enabled: entry.disabled !== true,
      fiberPhase: pluginFiberPhase(entry.fiber?.state),
    }
  }

  async executeCommand(params: { sessionId: string; line: string }): Promise<CommandExecution | undefined> {
    if (params.sessionId.trim() === '') throw new Error('commands/execute requires a session id')
    if (typeof params.line !== 'string') throw new TypeError('commands/execute requires a command line')
    const registry = this.ctx.get('commands') as CommandService | undefined
    if (registry === undefined) throw new Error('commands registry is not configured')
    const record = await this.getOrCreateSession(params.sessionId)
    this.assertLive(params.sessionId, record)
    return registry.execute(record.handle.agent, params.line, new AbortController().signal)
  }

  async listModels(): Promise<{
    groups: Record<string, unknown>[]
    failures: Record<string, unknown>[]
  }> {
    const llm = this.ctx.get('llm') as
      | { listProviders?: unknown; listModels?: unknown }
      | undefined
    if (typeof llm?.listProviders !== 'function' || typeof llm.listModels !== 'function') {
      throw new Error('model/list capability is unavailable: llm is not configured')
    }
    const service = llm as LlmService
    const groups: Record<string, unknown>[] = []
    const failures: Record<string, unknown>[] = []
    for (const provider of service.listProviders()) {
      const name = provider.name ?? provider.id
      try {
        const models = await service.listModels(provider.id)
        groups.push({
          id: provider.id,
          name,
          models: models.map((model) => ({
            id: model.id,
            name: model.name ?? model.id,
            ...(model.description === undefined ? {} : { description: model.description }),
          })),
        })
      } catch (error) {
        failures.push({
          id: provider.id,
          name,
          message: safeModelCatalogError(error),
        })
      }
    }
    return { groups, failures }
  }

  async respondQuestion(params: Record<string, unknown>): Promise<Record<string, never>> {
    const requestId = stringValue(params.requestId)
    const pending = requestId === undefined ? undefined : this.pendingQuestions.get(requestId)
    if (requestId === undefined || pending === undefined)
      throw new Error(`unknown question request: ${String(params.requestId)}`)
    this.pendingQuestions.delete(requestId)
    if (params.cancelled === true) {
      pending.reject(new Error('ask_user_question was interrupted before the user answered'))
      return {}
    }
    try {
      const answer = parseQuestionAnswer(params.answer)
      validateQuestionAnswer(pending.questions, answer)
      pending.resolve(answer)
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
    return {}
  }

  async respondApproval(params: Record<string, unknown>): Promise<Record<string, never>> {
    const requestId = stringValue(params.requestId)
    const pending = requestId === undefined ? undefined : this.pendingApprovals.get(requestId)
    if (requestId === undefined || pending === undefined)
      throw new Error(`unknown approval request: ${String(params.requestId)}`)
    this.pendingApprovals.delete(requestId)
    try {
      pending.resolve(parseApprovalOutcome(params.outcome))
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
    return {}
  }

  async handleRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.initialize(params as unknown as InitializeParams)
      case 'session/prompt':
        return this.prompt(params as unknown as PromptParams)
      case 'cocode/capabilities':
        return this.capabilities()
      case 'cocode/session/list':
      case 'session/list':
        return this.listSessions(params as { cwd?: string })
      case 'cocode/session/cancel':
      case 'session/cancel':
        return this.cancel(params as { sessionId: string; keepInbox?: boolean })
      case 'cocode/session/open':
      case 'session/open':
        return this.open(params as { sessionId: string; replaceSessionId?: string })
      case 'cocode/session/fork':
      case 'session/fork':
        return this.fork(
          params as {
            sourceSessionId: string
            boundary?: number
            rewindToMessageSeq?: number
            childSessionId?: string
            replaceSessionId?: string
          },
        )
      case 'cocode/skills/list':
      case 'skills/list':
        return this.listSkills(params as { sessionId: string })
      case 'cocode/commands/list':
      case 'commands/list':
        return this.listCommands(params as { sessionId: string })
      case 'cocode/commands/execute':
      case 'commands/execute':
        return this.executeCommand(params as { sessionId: string; line: string })
      case 'cocode/plugins/list':
      case 'plugins/list':
        return this.listPlugins()
      case 'cocode/plugins/set-enabled':
      case 'plugins/set-enabled':
        if (typeof params.entryId !== 'string' || typeof params.enabled !== 'boolean') {
          throw new TypeError('plugins/set-enabled requires entryId and enabled')
        }
        return this.setPluginEnabled({ entryId: params.entryId, enabled: params.enabled })
      case 'cocode/model/list':
      case 'model/list':
        return this.listModels()
      case 'cocode/attachment/saveImages':
        return this.saveImages(params)
      case 'cocode/permission/mode':
      case 'permission/mode':
        return this.permissionMode(params as { sessionId: string; mode?: string })
      case 'cocode/plan/mode':
      case 'plan/mode':
        return this.planMode(params as { sessionId: string; active?: boolean })
      case 'cocode/question/respond':
      case 'question/respond':
        return this.respondQuestion(params)
      case 'cocode/approval/respond':
      case 'approval/respond':
        return this.respondApproval(params)
      case 'shutdown':
        return this.shutdown()
      default:
        throw new Error(`unknown Cocode TUI companion method: ${method}`)
    }
  }

  shutdown(): Promise<Record<string, never>> {
    this.shutdownTask ??= this.performShutdown()
    return this.shutdownTask
  }

  /** Detach this socket without disposing agents owned by the shared Host. */
  disconnect(): Promise<Record<string, never>> {
    this.shutdownTask ??= this.performShutdown()
    return this.shutdownTask
  }

  private async askQuestion(request: {
    agent?: Agent
    questions: UserQuestion[]
    signal?: AbortSignal
  }): Promise<{ answers: UserQuestionAnswer[] }> {
    const requestId = `question-${randomUUID()}`
    const pending = createDeferred<{ answers: UserQuestionAnswer[] }>()
    this.pendingQuestions.set(requestId, {
      questions: request.questions,
      resolve: pending.resolve,
      reject: pending.reject,
    })
    this.transport.notify('cocode/question/request', {
      requestId,
      sessionId: request.agent === undefined ? '' : String(request.agent.session.id),
      questions: request.questions,
    })
    return raceWithAbort(pending.promise, request.signal, () => {
      this.pendingQuestions.delete(requestId)
      pending.reject(new Error('question request cancelled'))
    })
  }

  private async askApproval(
    request: ApprovalRequest,
    turn: number | undefined,
  ): Promise<ApprovalOutcome> {
    const requestId = `approval-${randomUUID()}`
    const pending = createDeferred<ApprovalOutcome>()
    this.pendingApprovals.set(requestId, { resolve: pending.resolve, reject: pending.reject })
    this.transport.notify('cocode/approval/request', {
      requestId,
      sessionId: String(request.agent.session.id),
      toolName: request.toolName,
      ...(typeof request.callId === 'string' ? { callId: request.callId } : {}),
      ...(typeof request.reason === 'string' ? { reason: request.reason } : {}),
      ...(typeof request.target === 'string' ? { target: request.target } : {}),
      ...(typeof request.risk === 'string' ? { risk: request.risk } : {}),
      ...(typeof request.source === 'string' ? { source: request.source } : {}),
    })
    const outcome = await raceWithAbort(pending.promise, request.signal, () => {
      this.pendingApprovals.delete(requestId)
      pending.resolve('cancelled')
    })
    if (outcome === 'allowed-for-turn' && turn !== undefined)
      this.rememberTurnAllowance(String(request.agent.session.id), request.toolName, turn)
    return outcome === 'allowed-for-turn' ? 'allowed-once' : parseApprovalOutcome(outcome)
  }

  private async getOrCreateSession(sessionId: string): Promise<SessionRecord> {
    if (this.shuttingDown) throw new Error('companion is shutting down')
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const live = this.ctx.agents.get(sessionId)
    if (live !== undefined) {
      const borrowed = this.borrowSession(live)
      this.sessions.set(sessionId, borrowed)
      return borrowed
    }
    const opening = this.sessionOpenings.get(sessionId)
    if (opening !== undefined) return opening
    const pending = this.sessionCreations.get(sessionId)
    if (pending !== undefined) return pending
    const creation = this.createSession(sessionId)
    this.sessionCreations.set(sessionId, creation)
    void creation.then(
      () => this.sessionCreations.delete(sessionId),
      () => this.sessionCreations.delete(sessionId),
    )
    return creation
  }

  private async createSession(sessionId: string): Promise<SessionRecord> {
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: { cwd: this.cwd },
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...(this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens }),
      },
    })
    const record = { handle, owned: true }
    this.sessions.set(sessionId, record)
    return record
  }

  private async resumeSession(sessionId: string): Promise<SessionRecord> {
    const persistence = this.ctx.get('sessionPersistence') as PersistenceService | undefined
    if (persistence === undefined)
      throw new Error('cannot open session: session persistence is not configured')
    const inspection = await persistence.inspect(sessionId)
    if (inspection.meta.cwd !== this.cwd)
      throw new Error(`session belongs to a different workspace: ${sessionId}`)
    const handle = await this.ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...(this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens }),
      },
    })
    return { handle, seed: [...inspection.events], owned: true }
  }

  private borrowSession(agent: Agent): SessionRecord {
    return {
      owned: false,
      handle: {
        agent,
        dispose: async () => undefined,
      },
      seed: [...agent.session.events],
    }
  }

  private async replaceSession(
    replaceSessionId: string | undefined,
    currentSessionId: string,
  ): Promise<void> {
    if (replaceSessionId === undefined || replaceSessionId === currentSessionId) return
    const previous = this.sessions.get(replaceSessionId)
    if (previous === undefined) return
    this.sessions.delete(replaceSessionId)
    await previous.handle.dispose()
  }

  private requireSession(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId)
    if (record === undefined) throw new Error(`unknown companion session: ${sessionId}`)
    return this.assertLive(sessionId, record)
  }

  private assertLive(sessionId: string, record: SessionRecord): SessionRecord {
    if (this.ctx.agents.get(record.handle.agent.id) !== record.handle.agent)
      throw new Error(`session agent was disposed outside the companion: ${sessionId}`)
    return record
  }

  private assertInitialized(): void {
    if (!this.initialized)
      throw new Error('initialize must be called before using the companion runtime')
  }

  private hasTurnAllowance(sessionId: string, toolName: string, turn: number): boolean {
    const allowance = this.turnAllowances.get(sessionId)
    return allowance?.turn === turn && allowance.tools.has(toolName)
  }

  private rememberTurnAllowance(sessionId: string, toolName: string, turn: number): void {
    const allowance = this.turnAllowances.get(sessionId)
    if (allowance?.turn === turn) allowance.tools.add(toolName)
    else this.turnAllowances.set(sessionId, { turn, tools: new Set([toolName]) })
  }

  private async performShutdown(): Promise<Record<string, never>> {
    this.shuttingDown = true
    await Promise.allSettled([...this.sessionCreations.values(), ...this.sessionOpenings.values()])
    this.sessionCreations.clear()
    this.sessionOpenings.clear()
    this.unregisterQuestionProvider()
    this.approvalDisposer?.()
    this.approvalDisposer = undefined
    const failures: unknown[] = []
    for (const pending of this.pendingQuestions.values())
      pending.reject(new Error('companion is shutting down'))
    for (const pending of this.pendingApprovals.values())
      pending.reject(new Error('companion is shutting down'))
    this.pendingQuestions.clear()
    this.pendingApprovals.clear()
    this.sessions.clear()
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'TUI companion teardown failed')
    return {}
  }
}

function safeModelCatalogError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const redacted = message
    .replace(/https?:\/\/[^\s]+/gi, '[redacted endpoint]')
    .replace(
      /\b(?:api[-_ ]?key|access[-_ ]?token|authorization|auth|token|secret|password)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,
      '[redacted]',
    )
    .replace(/\b(?:sk-|sk_|ck_(?:live|test)_)[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .trim()
  return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted
}

function createUserMessage(content: ContentBlock[], displayContent: ContentBlock[]): UserMessage {
  const message = {
    id: randomUUID(),
    role: 'user' as const,
    content,
    source: { kind: 'user' as const, displayContent },
  }
  return deepFreeze(message)
}

function parseImageInput(
  value: unknown,
  index: number,
  maxBytes: number,
  mediaTypes: readonly ImageMediaType[],
): { data: Uint8Array; mediaType: ImageMediaType; name?: string } {
  if (!isRecord(value) || typeof value.data !== 'string' || !isImageMediaType(value.mediaType)) {
    throw new TypeError(`attachment/saveImages image ${index + 1} is invalid`)
  }
  if (!mediaTypes.includes(value.mediaType)) {
    throw new Error(`attachment/saveImages does not accept ${value.mediaType}`)
  }
  const data = decodeBase64(value.data, maxBytes)
  const name = typeof value.name === 'string' && value.name.trim() !== ''
    ? value.name.trim()
    : undefined
  return {
    data,
    mediaType: value.mediaType,
    ...(name === undefined ? {} : { name }),
  }
}

function decodeBase64(value: string, maxBytes: number): Uint8Array {
  if (value === '' || value.length > Math.ceil(maxBytes / 3) * 4 + 4 || !BASE64_PATTERN.test(value)) {
    throw new Error('attachment/saveImages contains invalid base64 data')
  }
  const data = Buffer.from(value, 'base64')
  if (data.byteLength > maxBytes || data.toString('base64') !== value) {
    throw new Error('attachment/saveImages contains invalid base64 data')
  }
  return data
}

function isImageMediaType(value: unknown): value is ImageMediaType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif'
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function resolveForkBoundary(
  events: readonly SessionEvent[],
  params: { boundary?: number; rewindToMessageSeq?: number },
): number | undefined {
  if (params.boundary !== undefined && params.rewindToMessageSeq !== undefined)
    throw new Error('session/fork accepts boundary or rewindToMessageSeq, not both')
  if (params.rewindToMessageSeq === undefined) return params.boundary
  const messageIndex = events.findIndex((event) => event.seq === params.rewindToMessageSeq)
  if (events[messageIndex]?.type !== 'user/message')
    throw new Error(
      `rewind message seq does not identify a user message: ${params.rewindToMessageSeq}`,
    )
  let turnStart: SessionEvent | undefined
  for (let index = messageIndex; index >= 0; index -= 1) {
    if (events[index].type === 'turn/start') {
      turnStart = events[index]
      break
    }
  }
  if (turnStart === undefined || turnStart.seq === 0)
    throw new Error('cannot rewind to the first turn')
  return turnStart.seq - 1
}

function openTurnOf(events: readonly SessionEvent[]): number | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'turn/end') return undefined
    if (event.type === 'turn/start' && isRecord(event.data) && typeof event.data.turn === 'number')
      return event.data.turn
  }
  return undefined
}

function readSessionTitle(events: readonly SessionEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (
      event.type === 'session/title' &&
      isRecord(event.data) &&
      typeof event.data.title === 'string' &&
      event.data.title.length > 0
    )
      return event.data.title
  }
  return undefined
}

function parseQuestionAnswer(value: unknown): { answers: UserQuestionAnswer[] } {
  if (!isRecord(value) || !Array.isArray(value.answers))
    throw new Error('question response returned no answer batch')
  return {
    answers: value.answers.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== 'string' ||
        !Array.isArray(entry.selected) ||
        !entry.selected.every((item) => typeof item === 'string')
      )
        throw new Error('question response returned an invalid answer')
      return {
        id: entry.id,
        selected: entry.selected as string[],
        ...(typeof entry.custom === 'string' ? { custom: entry.custom } : {}),
      }
    }),
  }
}

function validateQuestionAnswer(
  questions: readonly UserQuestion[],
  answer: { answers: UserQuestionAnswer[] },
): void {
  if (questions.length !== answer.answers.length)
    throw new Error('question response count does not match the request')
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]
    const item = answer.answers[index]
    if (item.id !== question.id) throw new Error('question response id does not match the request')
    if (new Set(item.selected).size !== item.selected.length)
      throw new Error('question response repeats an option')
    if (item.custom !== undefined && item.custom.trim() === '')
      throw new Error('question custom answer must not be empty')
    if (question.multiSelect !== true && item.selected.length > 1)
      throw new Error('question response selected multiple options for a single-select question')
    if (question.multiSelect !== true && item.custom !== undefined && item.selected.length > 0)
      throw new Error('question response combined an option with custom text')
    const labels = new Set(question.options?.map((option) => option.label) ?? [])
    if (item.selected.some((label) => !labels.has(label)))
      throw new Error('question response selected an unknown option')
    if (item.selected.length === 0 && item.custom === undefined)
      throw new Error('question response is empty')
  }
}

function parseApprovalOutcome(value: unknown): ApprovalOutcome {
  if (
    value !== 'allowed-once' &&
    value !== 'allowed-for-turn' &&
    value !== 'rejected' &&
    value !== 'cancelled' &&
    value !== 'unavailable'
  )
    throw new Error(`unsupported approval outcome: ${String(value)}`)
  return value
}

function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void,
): Promise<T> {
  if (signal === undefined) return promise
  if (signal.aborted) {
    onAbort()
    return Promise.reject(new Error('interaction request cancelled'))
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort)
      onAbort()
      reject(new Error('interaction request cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined
  let rejectPromise: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function pluginFiberPhase(state: unknown): PluginFiberPhase {
  if (state === null || state === undefined || state === 4 || state === 'DISPOSED') return null
  if (state === 0 || state === 'PENDING') return 'pending'
  if (state === 1 || state === 'LOADING') return 'loading'
  if (state === 2 || state === 'ACTIVE') return 'active'
  if (state === 3 || state === 'FAILED') return 'failed'
  if (state === 5 || state === 'UNLOADING') return 'unloading'
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
