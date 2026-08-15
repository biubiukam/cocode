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
  restart(init: TuiInitialize, env?: NodeJS.ProcessEnv): Promise<{ name: string; version: string }>
  prompt(sessionId: string, blocks: ContentBlock[]): Promise<string>
  cancel(sessionId: string, keepInbox?: boolean): Promise<boolean>
  open(sessionId: string, replaceSessionId?: string): Promise<boolean>
  fork(
    sourceSessionId: string,
    boundary?: number,
    replaceSessionId?: string,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }>
  rewind(
    sourceSessionId: string,
    messageSeq: number,
    replaceSessionId?: string,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }>
  listSkills?(sessionId: string): Promise<SkillEntry[]>
  onQuestion?(handler: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>): () => void
  subscribe(handler: (n: TuiNotification) => void): () => void
  onClose?: (handler: (error?: string) => void) => () => void
  close(): Promise<void>
}
