export type ContentBlock = { type: string; [key: string]: unknown }

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export type ImageAttachmentRef = {
  attachmentId: string
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

export type SessionEvent = {
  type: string
  seq: number
  time: number
  data: unknown
  ignorable?: true
}

export type SessionHeader = {
  id: string
  createdAt: number
  cwd?: string
  parentSession?: string
  seedLength?: number
}

export type Agent = {
  id: string
  options: { provider?: string; model?: string; maxTokens?: number }
  session: { id: string; events: SessionEvent[]; header: SessionHeader }
  status: 'idle' | 'running'
  followup(message: UserMessage): void
  steer(message: UserMessage): void
  cancel(cause: { kind: 'user' }, options?: { keepInbox?: boolean }): void
  whenIdle(): Promise<void>
}

export type AgentHandle = { agent: Agent; dispose(): Promise<void> }

export type UserMessage = {
  id: string
  role: 'user'
  content: ContentBlock[]
  source: { kind: 'user' }
}

export type RuntimeContext = {
  agents: {
    get(id: string): Agent | undefined
    create(options: Record<string, unknown>): Promise<AgentHandle>
    resume(options: Record<string, unknown>): Promise<AgentHandle>
  }
  sessions: {
    forkSeed(session: Agent['session'], boundary?: number): SessionEvent[]
  }
  root: { fiber: { dispose(): Promise<void> } }
  get<T = unknown>(name: string): T | undefined
  on(event: string, handler: (...args: never[]) => unknown): () => void
  inject?(names: string[], handler: (ctx: RuntimeContext) => unknown): unknown
  effect?(create: () => unknown, label?: string): unknown
}

export type InitializeParams = {
  cwd: string
  provider: string
  model: string
  maxTokens?: number
}

export type PromptParams = {
  sessionId: string
  contentBlocks: ContentBlock[]
  mode?: 'normal' | 'queue' | 'steer'
}

export type CompanionCapabilities = {
  protocolVersion: 1
  promptModes: ('normal' | 'queue' | 'steer')[]
  skills: boolean
  modelList: boolean
  imageAttachments: boolean
  approval: boolean
  permissionMode: boolean
  planMode: boolean
  sessionList: boolean
  interactions: 'notification-response'
  checkpoint: false
}
