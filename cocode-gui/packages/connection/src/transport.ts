/**
 * The physical transport: envelopes, rpcId minting, media type, deadlines, and
 * socket lifecycle. Nothing above this file knows that `rpcId` exists (RFC §4.3).
 */

import { parseIncomingFrame, parseRpcReceipt, parseServerResponse, type StreamKind } from './schema.ts'
import {
  USER_PACED_METHODS,
  type RemoteArgs,
  type RemoteEndpoint,
  type RemoteValue,
  type RequestPayload,
  type ResponseValue,
  type RpcMethod,
} from './methods.ts'
import type { HostFrame, MuxFrame, RpcError, RpcId, RpcReceipt, RpcResult, SessionId } from './wire.ts'

/** Where a harness host answers. `baseUrl` is an absolute origin, or `''` for same-origin. */
export type HarnessHostEndpoint = {
  baseUrl: string
}

export type CallOptions = {
  signal?: AbortSignal
  /** Overrides the default deadline. User-paced methods carry no deadline at all. */
  timeoutMs?: number
}

export type StreamHandlers<F> = {
  onOpen(): void
  onFrame(rpcId: RpcId, frame: F): void
  /** Called exactly once per socket, whether it closed cleanly or failed. */
  onClose(reason: string): void
}

/** Default deadline for machine-paced unary calls, matching the harness's own. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Folds a thrown carrier failure into the error branch, so callers never see exceptions. */
function transportError(error: unknown): RpcError {
  return {
    code: 'internal',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  }
}

/**
 * Folds a non-2xx response into the error branch.
 *
 * HTTP status describes only the carrier, so it is carried in `details.status`
 * rather than encoded into the message: the trust fence answers 403 with plain
 * text, and a caller deciding how to explain that must read a number, not scrape
 * a string.
 */
function carrierError(label: string, status: number): RpcError {
  return {
    code: 'internal',
    message: `${label} failed with HTTP ${String(status)}`,
    details: { status },
  }
}

/**
 * Turns an HTTP(S) base into its WebSocket counterpart.
 * @param baseUrl - absolute origin, or `''` for same-origin.
 * @param path - absolute API path.
 * @returns the fully-qualified WebSocket URL.
 */
function socketUrl(baseUrl: string, path: string): string {
  const absolute = new URL(path, baseUrl === '' ? globalThis.location.href : baseUrl)
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:'
  return absolute.toString()
}

/**
 * Resolves an API path against the endpoint.
 * @param baseUrl - absolute origin, or `''` for same-origin.
 * @param path - absolute API path.
 * @returns the fully-qualified HTTP URL.
 */
function httpUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl === '' ? globalThis.location.href : baseUrl).toString()
}

export class HarnessTransport {
  readonly endpoint: HarnessHostEndpoint

  constructor(endpoint: HarnessHostEndpoint) {
    this.endpoint = endpoint
  }

  /**
   * Performs one unary call. Business failures come back in the error branch;
   * transport failures are folded into the same branch so no call site needs a try.
   * @param method - the RPC method, which also selects the URL path.
   * @param payload - the method's request payload.
   * @param options - cancellation and deadline overrides.
   * @returns the method's result.
   */
  async call<M extends RpcMethod>(
    method: M,
    payload: RequestPayload<M>,
    options: CallOptions = {},
  ): Promise<RpcResult<ResponseValue<M>>> {
    const rpcId = crypto.randomUUID()
    const deadline = options.timeoutMs ?? (USER_PACED_METHODS.has(method) ? undefined : DEFAULT_TIMEOUT_MS)
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = deadline === undefined
      ? undefined
      : setTimeout(() => controller.abort(new Error(`${method} timed out after ${String(deadline)}ms`)), deadline)

    try {
      const response = await fetch(httpUrl(this.endpoint.baseUrl, `/api/${method}`), {
        method: 'POST',
        // The gateway refuses anything else with 415 before dispatch.
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
        signal: controller.signal,
      })
      if (!response.ok) return { ok: false, error: carrierError(method, response.status) }
      const envelope = parseServerResponse(await response.json())
      if (envelope === undefined) {
        return { ok: false, error: { code: 'internal', message: `${method} returned a malformed envelope`, details: {} } }
      }
      if (envelope.rpcId !== rpcId) {
        return { ok: false, error: { code: 'internal', message: `${method} answered a different request`, details: {} } }
      }
      return envelope.result as RpcResult<ResponseValue<M>>
    }
    catch (error) {
      return { ok: false, error: transportError(error) }
    }
    finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }

  /**
   * Calls a Typert Remote endpoint — the second upstream channel, used by the
   * domains that publish a generated contract instead of an apiproxy method.
   *
   * It shares the request envelope with a unary call but differs in two ways the
   * gateway enforces: the URL carries a namespaced `<ns>/<method>` endpoint, and
   * the payload must be exactly one plain `args` object. There is no default
   * deadline; a caller that needs one passes a signal.
   *
   * @param endpoint - namespaced endpoint, e.g. `commands/list`.
   * @param args - the endpoint's named arguments.
   * @param options - cancellation and deadline overrides.
   * @returns the endpoint's result.
   */
  async callRemote<E extends RemoteEndpoint>(
    endpoint: E,
    args: RemoteArgs<E>,
    options: CallOptions = {},
  ): Promise<RpcResult<RemoteValue<E>>> {
    const rpcId = crypto.randomUUID()
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(new Error(`${endpoint} timed out`)), options.timeoutMs)

    try {
      const response = await fetch(httpUrl(this.endpoint.baseUrl, `/api/${endpoint}`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
        signal: controller.signal,
      })
      if (!response.ok) return { ok: false, error: carrierError(endpoint, response.status) }
      const envelope = parseServerResponse(await response.json())
      if (envelope === undefined) {
        return { ok: false, error: { code: 'internal', message: `${endpoint} returned a malformed envelope`, details: {} } }
      }
      if (envelope.rpcId !== rpcId) {
        return { ok: false, error: { code: 'internal', message: `${endpoint} answered a different request`, details: {} } }
      }
      return envelope.result as RpcResult<RemoteValue<E>>
    }
    catch (error) {
      return { ok: false, error: transportError(error) }
    }
    finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }

  /**
   * Answers a server-initiated request. The rpcId is echoed verbatim — minting a
   * new one here would orphan the harness's pending entry.
   * @param rpcId - the answered request's correlation id.
   * @param result - the client's decision, or a `cancelled` error branch.
   * @returns the carrier's receipt.
   */
  async respond(rpcId: RpcId, result: RpcResult<unknown>): Promise<RpcReceipt> {
    try {
      const response = await fetch(httpUrl(this.endpoint.baseUrl, '/api/respond'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-response', rpcId, result }),
      })
      if (!response.ok) return { accepted: false, reason: 'bad-response' }
      return parseRpcReceipt(await response.json())
    }
    catch {
      return { accepted: false, reason: 'bad-response' }
    }
  }

  /** Download URL for a session's log archive; the browser fetches it directly. */
  sessionExportUrl(sessionId: SessionId, includeDescendants = false): string {
    const url = new URL(httpUrl(this.endpoint.baseUrl, '/api/session.export'))
    url.searchParams.set('sessionId', sessionId)
    if (includeDescendants) url.searchParams.set('includeDescendants', 'true')
    return url.toString()
  }

  /** Opens the all-session mux stream. */
  openMux(handlers: StreamHandlers<MuxFrame>): () => void {
    return this.openStream('mux', '/api/events.mux', handlers)
  }

  /** Opens the host lifecycle stream. */
  openHost(handlers: StreamHandlers<HostFrame>): () => void {
    return this.openStream('host', '/api/events.host', handlers)
  }

  /**
   * Opens one downlink socket. The client never sends application data over it;
   * the harness closes with 1008 if anything is written.
   * @param kind - which frame vocabulary this socket carries.
   * @param path - the stream's API path.
   * @param handlers - open / frame / close callbacks.
   * @returns a disposer that closes the socket without invoking `onClose` twice.
   */
  private openStream<F extends MuxFrame | HostFrame>(
    kind: StreamKind,
    path: string,
    handlers: StreamHandlers<F>,
  ): () => void {
    let settled = false
    const settle = (reason: string) => {
      if (settled) return
      settled = true
      handlers.onClose(reason)
    }

    let socket: WebSocket
    try {
      socket = new WebSocket(socketUrl(this.endpoint.baseUrl, path))
    }
    catch (error) {
      queueMicrotask(() => settle(transportError(error).message))
      return () => {}
    }

    socket.addEventListener('open', () => handlers.onOpen())
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') return
      const parsed = parseIncomingFrame(event.data, kind)
      if (parsed === undefined) return
      handlers.onFrame(parsed.rpcId, parsed.frame as F)
    })
    socket.addEventListener('error', () => settle(`${kind} stream failed`))
    socket.addEventListener('close', event => settle(event.reason === '' ? `${kind} stream closed` : event.reason))

    return () => {
      settled = true
      socket.close()
    }
  }
}
