/**
 * The connection state machine (RFC §4.3).
 *
 * Readiness is: both downlink sockets open AND `host.describe` answered. There is
 * no per-socket reconnect — a generation is the unit of validity, and losing any
 * part of it invalidates the whole thing, including the pending server-requests
 * routed under it. The protocol has no seq-based resume, so recovery means
 * refetching baselines, never replaying a gap.
 */

import {
  COCODE_WIRE_PROTOCOL_VERSION,
  HarnessTransport,
  type HostDescription,
  type HostFrame,
  type MuxFrame,
  type RpcId,
  type RpcResult,
} from '@cocode/gui-connection'
import { Observable } from '../notifier.ts'

export type ConnectionPhase = 'idle' | 'connecting' | 'ready' | 'retrying' | 'failed'

export type ConnectionFailure = {
  /** Machine-routable reason so the shell can pick the right recovery copy. */
  kind: 'unreachable' | 'version-mismatch' | 'rejected' | 'stream-lost'
  message: string
  /** What the user can actually do about it; shown verbatim under the message. */
  hint?: string
}

export type ConnectionSnapshot = {
  phase: ConnectionPhase
  /** Increments on every attempt; downstream state is scoped to it. */
  generation: number
  baseUrl: string
  description?: HostDescription
  failure?: ConnectionFailure
  /** Present while retrying; the shell counts it down. */
  retryAtEpochMs?: number
  /**
   * True when the harness reports no protocol version at all. The connection is
   * usable, but a mismatch would surface as random missing methods (RFC §10.5).
   */
  protocolUnverified: boolean
}

export type FrameSink = {
  onMux(generation: number, rpcId: RpcId, frame: MuxFrame): void
  onHost(generation: number, rpcId: RpcId, frame: HostFrame): void
  /** A new generation became ready; every baseline must be refetched. */
  onReady(generation: number): void
  /** The generation died; drop everything scoped to it. */
  onLost(generation: number): void
}

/**
 * Backoff matching the harness's own client: exponential with a cap, then
 * jittered into the upper half of the window so a host restart does not bring
 * every open client back in lockstep.
 */
const BACKOFF_BASE_MS = 500
const BACKOFF_FACTOR = 2
const BACKOFF_MAX_MS = 10_000

/**
 * How long to wait for both sockets before declaring the generation ready anyway.
 *
 * This is deliberately soft. `host.describe` answering proves the host is alive
 * and reachable; a slow socket open should not hold the whole interface hostage,
 * because the gap it leaves is already repaired by the per-session baseline
 * refetch. A socket that never opens fails the generation through its own close.
 */
const STREAM_OPEN_TIMEOUT_MS = 3_000

function backoffDelay(attempt: number): number {
  const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** Math.max(0, attempt - 1))
  return cap / 2 + Math.random() * (cap / 2)
}

export class ConnectionController {
  readonly state = new Observable<ConnectionSnapshot>({
    phase: 'idle',
    generation: 0,
    baseUrl: '',
    protocolUnverified: false,
  })

  private transport: HarnessTransport | undefined
  private generation = 0
  private attempt = 0
  private closers: (() => void)[] = []
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(private readonly sink: FrameSink) {}

  /** The transport of the ready generation; `undefined` until one exists. */
  get activeTransport(): HarnessTransport | undefined {
    return this.state.get().phase === 'ready' ? this.transport : undefined
  }

  /**
   * Points the controller at an endpoint and starts a fresh generation.
   * Calling it again with a different endpoint replaces the current one.
   *
   * Connecting is an explicit new intent, so it revives a disposed controller.
   * Without that, a development double-invoked mount would dispose the controller
   * between its two effect passes and leave the shell connecting forever.
   * @param baseUrl - absolute origin, or `''` for same-origin.
   */
  connect(baseUrl: string): void {
    this.teardown()
    this.disposed = false
    this.attempt = 0
    this.transport = new HarnessTransport({ baseUrl })
    this.state.set({ ...this.state.get(), baseUrl, failure: undefined })
    void this.openGeneration()
  }

  /** Abandons any backoff and retries immediately. */
  retryNow(): void {
    if (this.disposed || this.transport === undefined) return
    this.teardown()
    this.attempt = 0
    void this.openGeneration()
  }

  /** Closes the current generation and stops retrying. */
  dispose(): void {
    this.disposed = true
    this.teardown()
  }

  private teardown(): void {
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    const closers = this.closers
    this.closers = []
    for (const close of closers) close()
    if (this.state.get().phase === 'ready') this.sink.onLost(this.generation)
  }

  private async openGeneration(): Promise<void> {
    const transport = this.transport
    if (transport === undefined) return

    this.generation += 1
    const generation = this.generation
    this.state.set({ ...this.state.get(), phase: 'connecting', generation, failure: undefined, retryAtEpochMs: undefined })

    let muxOpen = false
    let hostOpen = false
    let openSettled = false

    // Both sockets are opened alongside the describe call, not before it: the
    // three are independent facts about the same host, and serializing them
    // would add a full round trip to every reconnect.
    const bothOpen = new Promise<void>(resolveOpen => {
      const check = () => { if (muxOpen && hostOpen && !openSettled) { openSettled = true; resolveOpen() } }
      this.closers.push(transport.openMux({
        onOpen: () => { muxOpen = true; check() },
        onFrame: (rpcId, frame) => {
          if (generation !== this.generation) return
          // A stream error ends the stream on the host side; the generation is
          // over and only a rebuild can restore it.
          if (frame.type === 'stream/error') {
            this.loseGeneration(generation, frame.error.message)
            return
          }
          this.sink.onMux(generation, rpcId, frame)
        },
        onClose: reason => this.loseGeneration(generation, reason),
      }))
      this.closers.push(transport.openHost({
        onOpen: () => { hostOpen = true; check() },
        onFrame: (rpcId, frame) => {
          if (generation !== this.generation) return
          if (frame.type === 'stream/error') {
            this.loseGeneration(generation, frame.error.message)
            return
          }
          this.sink.onHost(generation, rpcId, frame)
        },
        onClose: reason => this.loseGeneration(generation, reason),
      }))
    })

    let openTimer: ReturnType<typeof setTimeout> | undefined
    const openDeadline = new Promise<void>(resolveDeadline => {
      openTimer = setTimeout(resolveDeadline, STREAM_OPEN_TIMEOUT_MS)
    })

    const [described] = await Promise.all([
      transport.call('host.describe', {}),
      Promise.race([bothOpen, openDeadline]),
    ])
    if (openTimer !== undefined) clearTimeout(openTimer)

    if (generation !== this.generation) return
    if (!described.ok) {
      this.failGeneration(generation, this.describeFailure(described))
      return
    }

    const description = described.value
    const reported = description.protocolVersion
    if (reported !== undefined && reported !== COCODE_WIRE_PROTOCOL_VERSION) {
      this.failGeneration(generation, {
        kind: 'version-mismatch',
        message: `harness 协议版本为 ${String(reported)}，本客户端为 ${String(COCODE_WIRE_PROTOCOL_VERSION)}。`,
        hint: '升级其中一侧，使两端协议版本一致。',
      })
      return
    }

    this.attempt = 0
    this.state.set({
      ...this.state.get(),
      phase: 'ready',
      generation,
      description,
      failure: undefined,
      retryAtEpochMs: undefined,
      protocolUnverified: reported === undefined,
    })
    this.sink.onReady(generation)
  }

  /** Turns a failed `host.describe` into the reason the shell should show. */
  private describeFailure(result: Extract<RpcResult<unknown>, { ok: false }>): ConnectionFailure {
    // The trust fence answers before dispatch and its refusal is a plain 403,
    // never an RPC error code — the carrier status is the only signal.
    if (result.error.details['status'] === 403) {
      return {
        kind: 'rejected',
        message: 'harness 拒绝了该请求来源。',
        hint: '远程访问需由 harness 侧显式授权（trustedHosts），或改经隧道 / 反向代理同源访问。',
      }
    }
    return {
      kind: 'unreachable',
      message: result.error.message,
      hint: '确认 harness 正在运行，且 GUI 指向了它的地址。',
    }
  }

  private loseGeneration(generation: number, reason: string): void {
    if (generation !== this.generation || this.disposed) return
    this.failGeneration(generation, {
      kind: 'stream-lost',
      message: reason,
      hint: '连接会自动重建；重建后界面会重新取回完整基线。',
    })
  }

  private failGeneration(generation: number, failure: ConnectionFailure): void {
    if (generation !== this.generation) return
    const wasReady = this.state.get().phase === 'ready'
    const closers = this.closers
    this.closers = []
    for (const close of closers) close()
    if (wasReady) this.sink.onLost(generation)

    if (this.disposed) return

    this.attempt += 1
    const delay = backoffDelay(this.attempt)
    this.state.set({
      ...this.state.get(),
      phase: 'retrying',
      failure,
      description: undefined,
      retryAtEpochMs: Date.now() + delay,
    })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.openGeneration()
    }, delay)
  }
}
