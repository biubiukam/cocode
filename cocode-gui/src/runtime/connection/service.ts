/**
 * Connection controller as a Cordis service.
 *
 * Mux/host frames are dispatched through `sessions.route`. Forwarded host
 * events become `ctx.emit` under their harness names.
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { HostFrame, MuxFrame } from '@cocode/gui-connection'
import { ConnectionController } from './controller.ts'

export class ConnectionService extends Service {
  readonly controller: ConnectionController

  constructor(ctx: Context) {
    super(ctx, 'connection')
    this.controller = new ConnectionController({
      onMux: (_generation, rpcId, frame: MuxFrame) => {
        ctx.root.get('sessions')?.dispatchMux(rpcId, frame)
      },
      onHost: (_generation, rpcId, frame: HostFrame) => {
        if (frame.type === 'host/remote-event') {
          const emit = ctx.emit.bind(ctx) as (name: string, ...args: unknown[]) => void
          emit(frame.event, ...frame.args)
          return
        }
        ctx.root.get('sessions')?.dispatchHost(rpcId, frame)
      },
      onReady: (generation) => {
        ctx.emit('connection/ready', generation)
      },
      onLost: (generation) => {
        ctx.emit('connection/lost', generation)
      },
    })
    ctx.effect(() => () => { this.controller.dispose() }, 'connection.dispose')
  }

  get activeTransport() {
    return this.controller.activeTransport
  }

  get state() {
    return this.controller.state
  }

  connect(baseUrl: string): void {
    this.controller.connect(baseUrl)
  }

  retryNow(): void {
    this.controller.retryNow()
  }

  dispose(): void {
    this.controller.dispose()
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: ConnectionService
  }
  interface Events {
    'connection/ready'(generation: number): void
    'connection/lost'(generation: number): void
    'commands/change'(...args: unknown[]): void
    'credentials/updated'(...args: unknown[]): void
    'settings/document-updated'(...args: unknown[]): void
    'llm/adapters-updated'(...args: unknown[]): void
    'shell/open-settings'(): void
    'shell/open-palette'(): void
  }
}
