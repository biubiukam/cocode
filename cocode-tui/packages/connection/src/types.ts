/**
 * Wire types the TUI runtime may see. Re-exported so src/ never
 * imports @deepseek-ai packages.
 */

export type ContentBlock = {
  type: string
  text?: string
  [key: string]: unknown
}

export type SessionEvent = {
  type: string
  seq: number
  time: number
  data: unknown
  ignorable?: true
}

export type SkillEntry = {
  name: string
  description: string
  whenToUse?: string
}

export type TuiQuestionOption = {
  label: string
  description?: string
}

export type TuiQuestionIntent = {
  kind: 'plan-review'
  approve: string
}

export type TuiQuestionItem = {
  id: string
  question: string
  detail?: string
  header?: string
  options?: TuiQuestionOption[]
  multiSelect?: boolean
  intent?: TuiQuestionIntent
}

export type TuiQuestionAnswerItem = {
  id: string
  selected: string[]
  custom?: string
}

export type TuiQuestionRequest = {
  sessionId: string
  questions: TuiQuestionItem[]
}

export type TuiQuestionAnswer = {
  answers: TuiQuestionAnswerItem[]
}

export type TuiPromptMode = 'normal' | 'queue' | 'steer'

export type TuiApprovalRequest = {
  sessionId: string
  toolName: string
  callId?: string
  reason?: string
  target?: string
  risk?: string
  source?: string
}

/** Approval choices accepted by the harness bridge. */
export type TuiApprovalOutcome =
  | 'allowed-once'
  | 'allowed-for-turn'
  | 'rejected'
  | 'cancelled'
  | 'unavailable'

export type TuiApprovalAnswer = { outcome: TuiApprovalOutcome }

export type TuiSessionSummary = {
  sessionId: string
  createdAt: number
  updatedAt?: number
  cwd?: string
  parentSessionId?: string
  seedLength?: number
  title?: string
  eventCount?: number
}

export type TuiSessionOpenResult = {
  opened: boolean
  seedLength?: number
  seed?: SessionEvent[]
}

export type TuiModel = {
  id: string
  name: string
  description?: string
}

export type TuiModelProviderGroup = {
  id: string
  name: string
  models: TuiModel[]
}

export type TuiModelCatalogFailure = {
  id: string
  name: string
  message: string
}

export type TuiModelCatalog = {
  groups: TuiModelProviderGroup[]
  failures: TuiModelCatalogFailure[]
}

export type TuiLaunch = {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

/**
 * Runtime operations whose availability is negotiated after initialize.
 *
 * These names describe wire/client facts, not local UI configuration. A
 * consumer should use the snapshot returned by `TuiRuntime.getCapabilities`
 * when it needs to decide whether to send one of these requests.
 */
export type TuiRuntimeCapabilityName =
  | 'cancel'
  | 'open'
  | 'fork'
  | 'rewind'
  | 'skills'
  | 'onRequest'
  | 'approval'
  | 'permissionMode'
  | 'planMode'
  | 'sessionList'
  | 'promptMode'
  | 'queueMode'
  | 'modelList'

export type TuiRuntimeCapabilities = Record<TuiRuntimeCapabilityName, boolean>

export type TuiRuntimeAdvertisement = {
  promptModes: TuiPromptMode[]
  approval: boolean
  permissionMode: boolean
  planMode: boolean
  sessionList: boolean
  modelList: boolean
  checkpoint: false
}

/** Result of probing the live SDK runtime after its initialize handshake. */
export type TuiCapabilitySnapshot = {
  /** `runtime` means probes ran; `fallback` means no probe API was available. */
  source: 'runtime' | 'fallback'
  capabilities: TuiRuntimeCapabilities
  modes?: TuiRuntimeAdvertisement
  /** Human-readable probe failures, keyed by the capability they describe. */
  errors: Partial<Record<TuiRuntimeCapabilityName, string>>
}

export type TuiInitialize = {
  cwd: string
  provider: string
  model: string
  maxTokens?: number
}

export type SubagentFinished = {
  provider: string
  agentId: string
  parentSessionId: string
  childSessionId: string
  status: string
}

export type TuiNotification =
  | {
      method: 'session.event'
      params: { sessionId: string; event: SessionEvent }
    }
  | {
      method: 'session.status'
      params: { sessionId: string; status: 'idle' | 'running' }
    }
  | {
      method: 'subagent.started'
      params: { parentSessionId: string; childSessionId: string }
    }
  | { method: 'subagent.finished'; params: SubagentFinished }

export type TuiRuntime = {
  start(
    init: TuiInitialize,
  ): Promise<{ name: string; version: string; capabilities?: TuiRuntimeAdvertisement }>
  restart(
    init: TuiInitialize,
    env?: NodeJS.ProcessEnv,
  ): Promise<{ name: string; version: string; capabilities?: TuiRuntimeAdvertisement }>
  prompt(sessionId: string, blocks: ContentBlock[], mode?: TuiPromptMode): Promise<string>
  cancel(sessionId: string, keepInbox?: boolean): Promise<boolean>
  open(sessionId: string, replaceSessionId?: string): Promise<boolean | TuiSessionOpenResult>
  fork(
    sourceSessionId: string,
    boundary?: number,
    replaceSessionId?: string,
    rewindToMessageSeq?: number,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }>
  rewind(
    sourceSessionId: string,
    messageSeq: number,
    replaceSessionId?: string,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }>
  listSkills?(sessionId: string): Promise<SkillEntry[]>
  listSessions?(cwd?: string): Promise<TuiSessionSummary[]>
  listModels?(): Promise<TuiModelCatalog>
  permissionMode?(
    sessionId: string,
    mode?: string,
  ): Promise<{ mode: string; supportedModes: string[] }>
  planMode?(sessionId: string, active?: boolean): Promise<{ active: boolean; pending?: boolean }>
  onQuestion?(handler: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>): () => void
  onApproval?(handler: (request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>): () => void
  /** Live capability snapshot; absent on legacy/fake runtimes. */
  getCapabilities?(): TuiCapabilitySnapshot
  subscribe(handler: (n: TuiNotification) => void): () => void
  onClose?: (handler: (error?: string) => void) => () => void
  close(): Promise<void>
}
