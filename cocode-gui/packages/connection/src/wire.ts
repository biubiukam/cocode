/**
 * The harness wire vocabulary as Cocode consumes it.
 *
 * These declarations mirror `dsh-host-apiproxy`'s `api/` contract. They are
 * restated rather than imported: the two repositories are separate products
 * joined only by the protocol (RFC §4), and the GUI must build without a harness
 * checkout on disk. Anything narrowed here is narrowed because Cocode reads it;
 * fields the GUI never touches stay loose on purpose.
 */

/** Correlation id. The initiator mints it; a response echoes it and never mints a new one. */
export type RpcId = string
export type SessionId = string
export type WorkspaceId = string
export type CallId = string
export type MessageId = string

/** Business failure carried in the error branch of an {@link RpcResult}. */
export type RpcError = {
  /** Closed on the harness side; treated as an open string because Cocode only routes a few codes. */
  code: string
  message: string
  details: Record<string, unknown>
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }

export type ClientRequest = { type: 'client-request'; rpcId: RpcId; method: string; payload: unknown }
export type ServerResponse = { type: 'server-response'; rpcId: RpcId; result: RpcResult<unknown> }
export type ServerRequest = { type: 'server-request'; rpcId: RpcId; method: string; payload: unknown }
export type ClientResponse = { type: 'client-response'; rpcId: RpcId; result: RpcResult<unknown> }

/** Carrier acknowledgement of `POST /api/respond`; not itself an RPC message. */
export type RpcReceipt = { accepted: true } | { accepted: false; reason: 'not-pending' | 'bad-response' }

// ---- Model-facing content ----

export type TextBlock = { type: 'text'; text: string }
export type ReasoningBlock = { type: 'reasoning'; text: string }
export type ImageBlock = { type: 'image'; attachment: ImageAttachmentRef }
export type ToolCallBlock = { type: 'tool-call'; id: CallId; name: string; arguments: string }
export type ToolResultBlock = { type: 'tool-result'; toolCallId: CallId; content: ContentBlock[]; isError?: boolean }

/** Merge-extensible on the harness side; an unknown `type` renders as raw JSON. */
export type ContentBlock =
  | TextBlock
  | ReasoningBlock
  | ImageBlock
  | ToolCallBlock
  | ToolResultBlock
  | { type: string; [key: string]: unknown }

export type ImageAttachmentRef = {
  id: string
  mediaType: string
  byteLength?: number
  width?: number
  height?: number
  name?: string
}

export type Message = {
  id: MessageId
  role: 'system' | 'user' | 'assistant'
  content: ContentBlock[]
  source: { kind: string; [key: string]: unknown }
}

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export type StreamChunk =
  | { type: 'block-start'; index: number; blockType: string }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: { kind: string; [key: string]: unknown } }

// ---- Session log ----

/**
 * One durable session-log record. `data` stays `unknown` at the type level and is
 * narrowed by `type` at the fold, exactly as the wire schema does: the event map
 * is merge-extensible, so no client build can enumerate it.
 */
export type SessionEvent = {
  type: string
  seq: number
  /** Epoch ms. */
  time: number
  data: unknown
  ignorable?: true
  sourceEventSeqs?: number[]
  surfaceOp?: 'append' | { op: 'replace'; start: number; end: number }
}

export type TurnStartData = { turn: number }
export type TurnEndData = { turn: number; reason: { kind: string; [key: string]: unknown } }
export type AssistantChunkData = { turn: number; step: number; chunk: StreamChunk }
export type AssistantMessageData = { turn: number; step: number; message: Message; usage?: TokenUsage }
export type ToolCallData = { turn: number; step: number; callId: CallId; name: string; arguments: string }
export type ToolResultData = {
  turn: number
  step: number
  message: Message & { source: { kind: string; callId: CallId } }
  error?: { name: string; code: string }
  meta?: unknown
}
export type TodoWriteData = { todos: TodoItem[] }
export type TodoItem = { id?: string; content: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }
export type CommandRunData = { commandId: string; name: string; args?: string; source?: unknown }
export type CommandDoneData = { commandId: string; kind: 'success' | 'error'; text?: string }

// ---- Tool presentation views ----

export type FileLocation = { path: string; line?: number }
export type FileDiff = { path: string; oldText: string | null; newText: string }
export type ReadFileLine = { number: number; text: string }

export type ToolCallView =
  | { card: 'generic'; title: string; kind?: string; rawInput?: unknown; content?: ContentBlock[]; locations?: FileLocation[] }
  | { card: 'terminal'; title: string; description?: string; cwd?: string }
  | { card: 'diff'; title: string; diffs: FileDiff[]; locations?: FileLocation[] }

export type ToolResultView =
  | { card: 'generic'; title?: string; content?: ContentBlock[] }
  | { card: 'terminal'; title?: string; output?: string; exitCode?: number; signal?: string }
  | { card: 'diff'; title?: string; diffs: FileDiff[] }
  | { card: 'search'; shape: 'matches'; title?: string; files: { path: string; matches: { lineNumber: number; line: string }[] }[]; truncated: boolean; total: number }
  | { card: 'search'; shape: 'paths'; title?: string; paths: string[]; truncated: boolean; total: number }
  | { card: 'read'; title?: string; path: string; lines: ReadFileLine[]; truncated?: boolean }
  | { card: 'web'; title?: string; url?: string; content?: ContentBlock[] }

/** Which vocabulary the accompanying view speaks; absent means the generic card. */
export type ToolEventView = { for: 'call'; view: ToolCallView } | { for: 'result'; view: ToolResultView }

// ---- Domain records ----

export type SessionProjectionsBlock = { asOfSeq: number; values: Record<string, unknown> }

export type SessionSummary = {
  sessionId: SessionId
  updatedAt: number
  running: boolean
  blank: boolean
  parentSessionId?: SessionId
  origin?: 'subagent'
  cwd?: string
  agentPreset?: string
  projections?: SessionProjectionsBlock
}

export type WorkspaceView = {
  workspaceId: WorkspaceId
  path: string
  title: string
  sessionIds: SessionId[]
  createdAt: string
  updatedAt: string
}

export type HistoryEntry = { event: SessionEvent; view?: ToolEventView }

export type JobView = {
  id: string
  kind: string
  label: string
  status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  detail?: string
  startedAt: number
  finishedAt?: number
}

export type QueuedInboxItem = {
  id: MessageId
  placement: 'queued' | 'steering' | 'context'
  message: Message
}

export type AskUserQuestionOption = { id: string; label: string }
export type AskUserQuestionItem = {
  id: string
  prompt: string
  options: AskUserQuestionOption[]
  allow_multiple?: boolean
}

/**
 * Optional host surfaces a client may or may not find composed. An absent flag
 * reads like `false`; the object itself is optional so older hosts stay valid.
 */
export type HostCapabilities = {
  schedule?: boolean
  jobs?: boolean
  workflow?: boolean
}

export type HostDescription = {
  version: string
  cwd: string
  provider?: string
  model?: string
  attachedSessions: SessionId[]
  canOpenPath: boolean
  /**
   * Wire protocol generation. Absent on harness builds that predate the field
   * (RFC §10.5); a client that finds it absent proceeds and reports the risk
   * rather than refusing to connect.
   */
  protocolVersion?: number
  /** Optional domain flags; absent means every flag is false. */
  capabilities?: HostCapabilities
}

/** Session-local reminder identity (host `ScheduleId` brand is a string on the wire). */
export type ScheduleId = string

/** Absolute target accepted by `schedule.create`. */
export type ScheduleAtInput = string | { date: string; time: string; timeZone: string }

/** Fields every reminder view carries, independent of its rule kind. */
export type ScheduleListItemShared = {
  id: ScheduleId
  sessionId: SessionId
  prompt: string
  scheduledAt: string
  state: 'scheduled' | 'overdue'
  deliveryMode: 'session-local'
  /** Whether the owning session currently has a live agent that can deliver. */
  deliveryReady: boolean
}

/** One active reminder as `schedule.list` / `host/schedules` carries it. */
export type ScheduleListItem =
  | (ScheduleListItemShared & { kind: 'after'; afterSeconds: number })
  | (ScheduleListItemShared & { kind: 'at' })
  | (ScheduleListItemShared & { kind: 'every'; everySeconds: number })

/** One live workflow run as `host/workflows` carries it. */
export type WorkflowRunView = {
  sessionId: SessionId
  runId: string
  name: string
}

/** Host directory-picker row (`host.listDirectory`); directories only on the wire today. */
export type DirectoryEntry = { name: string; path: string; kind?: 'directory' | 'file'; size?: number; modifiedAt?: number; hidden?: boolean }
export type DirectoryListing = {
  path: string
  parent?: string
  home?: string
  crumbs?: DirectoryEntry[]
  entries: DirectoryEntry[]
  truncated?: boolean
}

/** Workspace-scoped Files panel row (`fs.list`). */
export type FsEntry = {
  name: string
  path: string
  kind: 'file' | 'directory' | 'other'
  size?: number
  modifiedAt?: number
  hidden: boolean
}

export type FsListing = {
  path: string
  root: string
  parent?: string
  entries: FsEntry[]
}

/** `fs.read` result — text body, or binary with optional base64 when requested. */
export type FsReadResult =
  | { path: string; kind: 'text'; text: string; byteLength: number }
  | { path: string; kind: 'binary'; byteLength: number; base64?: string }

export type TerminalView = {
  terminalId: string
  name: string
  kind: 'user' | 'agent'
  writable: boolean
  cols: number
  rows: number
  cwd?: string
}

export type GitFileStatus =
  | 'untracked'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflict'

export type GitChangedFile = {
  path: string
  status: GitFileStatus
  staged: boolean
}

export type GitStatus = {
  branch: string
  ahead: number
  behind: number
  files: GitChangedFile[]
}

export type GitDiffFile = {
  path: string
  oldText: string | null
  newText: string
}

export type GitLogItem = {
  sha: string
  subject: string
  author: string
  authoredAt: string
}

/** Direct child row from `subagent.list`. */
export type SubagentListEntry =
  | {
    kind: 'child'
    id: SessionId
    activity: 'running' | 'inactive'
    hasChildren: boolean
    mode: 'one-shot' | 'continuable'
    label?: string
  }
  | {
    kind: 'diagnostic'
    id: SessionId
    reason: 'corrupt' | 'unsupported' | 'unavailable'
  }

export type SubagentCatalog = {
  entries: SubagentListEntry[]
  parentAvailable: boolean
}

export type ModelSelection = { provider: string; model: string; reasoningEffort?: string }
export type ModelCatalogModel = { id: string; name: string; description?: string }
export type ModelProviderGroup = { id: string; name: string; models: ModelCatalogModel[] }
export type ModelCatalogFailure = { id: string; name: string; message: string }
export type SessionModels = {
  current: ModelSelection
  routable: boolean
  groups: ModelProviderGroup[]
  failures: ModelCatalogFailure[]
}

/** One row of `llm.providers` — where a route can be configured. */
export type ConfigurableProviderView = {
  provider: string
  displayName: string
  settingsNs: string
  settingsPath: string[]
  active: boolean
  declared?: boolean
}

/** One model an endpoint advertised during `llm.discoverModels`. */
export type DiscoveredModelView = {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

// ---- Slash commands (Typert Remote domain) ----

/** Expected command outcome, rendered by the dispatching surface. */
export type CommandResult =
  | { kind: 'success'; text?: string; sourceEventSeq?: number }
  | { kind: 'error'; text: string }

/** One settled command execution, correlated with its `command/run` records. */
export type CommandExecution = {
  commandId: string
  result: CommandResult
}

/** One registered command, as discovery surfaces see it. */
export type CommandDescriptor = {
  /** Lowercase name without the leading slash. */
  name: string
  description: string
  /** Free-form input hint, when the command accepts one. */
  input?: { hint: string }
}

/** Compare-and-set identity for one exact goal revision. */
export type GoalRef = { id: string; revision: number }
export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'
export type GoalSnapshot = GoalRef & {
  objective: string
  phase: GoalPhase
  blockedReason?: { code: string; message: string }
  maxGoalRounds: number
}

/** Value of the `goal` session projection; `null` before the first create and after a clear. */
export type GoalProjection = {
  goal: GoalSnapshot
  roundsStarted: number
  createdAt: number
  updatedAt: number
}

export type PromptContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string; name?: string }

export type QueueAction = { kind: 'edit'; content: ContentBlock[] } | { kind: 'remove' } | { kind: 'steer' }

/** One schema-declared secret slot inside a redacted settings namespace. */
export type SettingsSecretView = { path: string[]; set: boolean }

/** Wire view of one registered settings namespace. Secret values never ride. */
export type SettingsNamespaceView = {
  ns: string
  schema: unknown
  value: unknown
  base?: unknown
  user?: unknown
  applies: 'live' | 'restart'
  secrets: SettingsSecretView[]
  revision: number
}

export type SettingsPathOp =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] }

/** Value-free view of one credential reference. */
export type CredentialView = {
  configured: boolean
  source?: string
  writable: boolean
}

/** Lifecycle state of a Loader entry's root Fiber, or null when it has none. */
export type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** One non-group Loader entry from `pluginInventory/list`. */
export type PluginInventoryEntry = {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: PluginFiberPhase
}

// ---- Downlink frames ----

export type MuxFrame =
  | { type: 'session/event'; sessionId: SessionId; event: SessionEvent; view?: ToolEventView }
  | { type: 'session/subscribed'; sessionId: SessionId; lastSeq: number }
  | { type: 'approval/requested'; sessionId: SessionId; approvalId: string; toolName: string; callId?: CallId; reason?: string }
  | { type: 'approval/resolved'; sessionId: SessionId; approvalId: string; outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' }
  | { type: 'question/requested'; sessionId: SessionId; questions: AskUserQuestionItem[] }
  | { type: 'question/resolved'; sessionId: SessionId; questionRpcId: RpcId; outcome: 'answered' | 'cancelled' }
  | { type: 'session/queue'; sessionId: SessionId; items: QueuedInboxItem[] }
  | { type: 'session/jobs'; sessionId: SessionId; jobs: JobView[] }
  | { type: 'session/projection'; sessionId: SessionId; key: string; value: unknown; seq: number }
  | { type: 'terminal/output'; terminalId: string; data: string }
  | { type: 'terminal/exit'; terminalId: string; exitCode: number | null; signal: string | null }
  | { type: 'stream/error'; error: RpcError }

export type HostFrame =
  | { type: 'host/session-added'; sessionId: SessionId; blank: boolean; parentSessionId?: SessionId; origin?: 'subagent'; cwd?: string; agentPreset?: string }
  | { type: 'host/session-removed'; sessionId: SessionId }
  | { type: 'host/session-status'; sessionId: SessionId; running: boolean }
  | { type: 'host/agent-error'; sessionId: SessionId; message: string }
  | { type: 'host/workspace-changed'; workspace: WorkspaceView }
  | { type: 'host/workspace-removed'; workspaceId: WorkspaceId }
  | { type: 'host/workspace-order-changed'; workspaceIds: WorkspaceId[] }
  | { type: 'host/archived-sessions-changed'; archivedSessionIds: SessionId[] }
  | { type: 'host/schedules'; items: ScheduleListItem[] }
  | { type: 'host/workflows'; items: WorkflowRunView[] }
  | { type: 'host/remote-event'; event: string; args: unknown[] }
  | { type: 'stream/error'; error: RpcError }

/** A downlink frame paired with the rpcId an answerable frame must echo back. */
export type IncomingFrame<F> = { rpcId: RpcId; frame: F }
