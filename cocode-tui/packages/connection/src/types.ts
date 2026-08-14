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

export type TuiLaunch = {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
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
  start(init: TuiInitialize): Promise<{ name: string; version: string }>
  prompt(sessionId: string, blocks: ContentBlock[]): Promise<string>
  subscribe(handler: (n: TuiNotification) => void): () => void
  onClose?: (handler: (error?: string) => void) => () => void
  close(): Promise<void>
}
