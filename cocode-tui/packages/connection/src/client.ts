/**
 * HarnessClient adapter. Do not wrap DeepSeekHarness.run().
 */

import type {
  SessionEvent,
  TuiInitialize,
  TuiLaunch,
  TuiNotification,
  TuiRuntime,
} from './types.ts'

type SdkClient = typeof import('@deepseek-ai/dsh-sdk-client')
type HarnessClient = InstanceType<SdkClient['HarnessClient']>
type CancelableHarnessClient = HarnessClient & {
  cancel(sessionId: string, keepInbox?: boolean): Promise<boolean>
}

export function createTuiRuntime(launch: TuiLaunch): TuiRuntime {
  return new SdkTuiRuntime(launch)
}

class SdkTuiRuntime implements TuiRuntime {
  private client: HarnessClient | undefined
  private launch: TuiLaunch
  private readonly handlers = new Set<(n: TuiNotification) => void>()
  private readonly closeHandlers = new Set<(error?: string) => void>()
  private pump: Promise<void> | undefined
  private subscription: { close(): void } | undefined
  private closing = false

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
    this.client = client
    this.closing = false
    try {
      client.start()
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
