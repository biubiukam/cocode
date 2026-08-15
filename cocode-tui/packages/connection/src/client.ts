/**
 * HarnessClient adapter. Do not wrap DeepSeekHarness.run().
 */

import type {
  SessionEvent,
  SkillEntry,
  TuiQuestionAnswer,
  TuiQuestionRequest,
  TuiInitialize,
  TuiLaunch,
  TuiNotification,
  TuiRuntime,
} from './types.ts'

type SdkClient = typeof import('@deepseek-ai/dsh-sdk-client')
type HarnessClient = InstanceType<SdkClient['HarnessClient']>
type RequestAwareHarnessClient = HarnessClient & {
  onRequest?: (
    handler: (method: string, params: Record<string, unknown>) => Promise<unknown>,
  ) => () => void
}
type CancelableHarnessClient = HarnessClient & {
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
}

export function createTuiRuntime(launch: TuiLaunch): TuiRuntime {
  return new SdkTuiRuntime(launch)
}

class SdkTuiRuntime implements TuiRuntime {
  private client: RequestAwareHarnessClient | undefined
  private launch: TuiLaunch
  private readonly handlers = new Set<(n: TuiNotification) => void>()
  private readonly closeHandlers = new Set<(error?: string) => void>()
  private pump: Promise<void> | undefined
  private subscription: { close(): void } | undefined
  private closing = false
  private questionHandler: ((request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>) | undefined
  private clientRequestDisposer: (() => void) | undefined

  constructor(launch: TuiLaunch) {
    this.launch = launch
  }

  async start(init: TuiInitialize): Promise<{ name: string; version: string }> {
    const { HarnessClient } = await import('@deepseek-ai/dsh-sdk-client')
    const client = new HarnessClient({
      command: this.launch.command,
      args: this.launch.args,
      cwd: this.launch.cwd,
      env: this.launch.env,
    })
    const requestAwareClient = client as RequestAwareHarnessClient
    this.client = requestAwareClient
    this.closing = false
    try {
      client.start()
      this.clientRequestDisposer = requestAwareClient.onRequest?.(async (method, params) => {
        if (method !== 'question/ask') throw new Error(`unknown server request: ${method}`)
        const handler = this.questionHandler
        if (handler === undefined) throw new Error('TUI has no question handler')
        return handler(parseQuestionRequest(params))
      })
      const sub = client.subscribe()
      this.subscription = sub
      this.pump = this.readLoop(sub)
      const result = await client.initialize(init)
      return result.serverInfo
    } catch (error) {
      this.closing = true
      await this.close().catch(() => undefined)
      throw error
    }
  }

  async restart(
    init: TuiInitialize,
    env?: NodeJS.ProcessEnv,
  ): Promise<{ name: string; version: string }> {
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

  async prompt(sessionId: string, blocks: { type: string; text?: string }[]): Promise<string> {
    const client = this.requireClient()
    return client.prompt(sessionId, blocks as never)
  }

  async cancel(sessionId: string, keepInbox = false): Promise<boolean> {
    const client = this.requireClient()
    return (client as CancelableHarnessClient).cancel(sessionId, keepInbox)
  }

  async open(sessionId: string, replaceSessionId?: string): Promise<boolean> {
    const client = this.requireClient()
    return (client as CancelableHarnessClient).open(sessionId, replaceSessionId)
  }

  async fork(
    sourceSessionId: string,
    boundary?: number,
    replaceSessionId?: string,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }> {
    const client = this.requireClient()
    return (client as CancelableHarnessClient).fork(sourceSessionId, boundary, replaceSessionId)
  }

  async rewind(
    sourceSessionId: string,
    messageSeq: number,
    replaceSessionId?: string,
  ): Promise<{ sessionId: string; seedLength: number; seed: SessionEvent[] }> {
    const client = this.requireClient()
    return (client as CancelableHarnessClient).rewind(sourceSessionId, messageSeq, replaceSessionId)
  }

  async listSkills(sessionId: string): Promise<SkillEntry[]> {
    const client = this.requireClient() as HarnessClient & {
      listSkills(sessionId: string): Promise<SkillEntry[]>
    }
    return client.listSkills(sessionId)
  }

  onQuestion(handler: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>): () => void {
    this.questionHandler = handler
    return () => {
      if (this.questionHandler === handler) this.questionHandler = undefined
    }
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
    this.clientRequestDisposer?.()
    this.clientRequestDisposer = undefined
    await this.client?.close()
    await this.pump?.catch(() => undefined)
  }

  private requireClient(): HarnessClient {
    if (this.client === undefined) {
      throw new Error('TuiRuntime.start() has not run')
    }
    return this.client
  }

  private async readLoop(
    sub: AsyncIterable<{ method: string; params: Record<string, unknown> }>,
  ): Promise<void> {
    let errorMessage: string | undefined
    try {
      for await (const notification of sub) {
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
