import net from 'node:net'
import { chmodSync, existsSync, unlinkSync } from 'node:fs'
import { CompanionTransport } from './transport.js'
import { TuiCompanionGateway } from './gateway.js'
import type { RuntimeContext } from './types.js'

export const name = 'cocode-host-jsonrpc'
export const inject = ['agents']

export function apply(ctx: RuntimeContext, config: { endpoint: string; protocolRevision?: string } = { endpoint: '' }): void {
  if (!config.endpoint) throw new Error('cocode-host-jsonrpc requires an endpoint')
  const clients = new Set<TuiCompanionGateway>()
  let questionOwner: TuiCompanionGateway | undefined
  const server = net.createServer((socket) => {
    let authenticated = false
    let buffer = ''
    const transport = new CompanionTransport(socket, socket)
    const gateway = new TuiCompanionGateway(ctx, transport, { registerQuestionProvider: false })
    clients.add(gateway)
    if (questionOwner === undefined) {
      questionOwner = gateway
      gateway.tryRegisterQuestionProvider()
    }
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      const first = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      let frame: { id?: number; method?: string; params?: Record<string, unknown> }
      try { frame = JSON.parse(first) } catch { socket.destroy(); return }
      if (frame.method !== 'cocode/host/connect' || typeof frame.id !== 'number') { socket.destroy(); return }
      authenticated = true
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { protocolRevision: config.protocolRevision ?? '1.0', capabilities: ['session', 'event', 'workspace'] } })}\n`)
      socket.off('data', onData)
      if (buffer) socket.emit('data', Buffer.from(buffer))
      transport.start()
    }
    socket.on('data', onData)
    socket.once('close', () => {
      clients.delete(gateway)
      void gateway.disconnect().catch(() => undefined)
      transport.close()
      if (questionOwner === gateway) {
        questionOwner = clients.values().next().value
        questionOwner?.tryRegisterQuestionProvider()
      }
    })
    transport.onRequest(async (method, params) => gateway.handleRequest(method, params))
  })
  if (process.platform !== 'win32' && existsSync(config.endpoint)) unlinkSync(config.endpoint)
  server.listen(config.endpoint)
  if (process.platform !== 'win32') { try { chmodSync(config.endpoint, 0o600) } catch {} }
  ctx.effect?.(() => async () => { await new Promise<void>((resolve) => server.close(() => resolve())); }, 'cocode-host-jsonrpc.serve')
}
