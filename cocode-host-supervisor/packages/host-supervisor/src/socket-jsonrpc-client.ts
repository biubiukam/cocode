import net from 'node:net'
import { openLineConnection, type LinePeer } from './ipc.js'
import type { HostServiceEndpoint } from './protocol.js'

export type JsonRpcNotification = { method: string; params: Record<string, unknown> }
export type JsonRpcPeer = {
  request<T>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>
  subscribe(handler: (notification: JsonRpcNotification) => void): () => void
  onClose(handler: (error?: string) => void): () => void
  close(): void
}

export async function connectJsonRpc(endpoint: HostServiceEndpoint, token?: string): Promise<JsonRpcPeer> {
  const peer = await openLineConnection(endpoint.endpoint)
  const subscriptions = new Set<(notification: JsonRpcNotification) => void>()
  const closeHandlers = new Set<(error?: string) => void>()
  peer.onNotification((method, params) => { for (const handler of subscriptions) handler({ method, params }) })
  peer.onClose((error) => {
    const message = error.message || undefined
    for (const handler of closeHandlers) handler(message)
  })
  await peer.request('cocode/host/connect', { token: token ?? endpoint.token ?? null, protocolRevision: endpoint.protocolRevision })
  return {
    request: (method, params, timeoutMs) => peer.request(method, params ?? {}, timeoutMs),
    subscribe: (handler) => { subscriptions.add(handler); return () => subscriptions.delete(handler) },
    onClose: (handler) => { closeHandlers.add(handler); return () => closeHandlers.delete(handler) },
    close: () => peer.close(),
  }
}
