/**
 * Client half of the frame channel.
 *
 * The socket carries binary frames down and JSON events up. Acking only after
 * the frame is painted is what throttles the stream, so the ack must be issued
 * by the renderer, not on arrival.
 */
import {
  BROWSER_STREAM_PATH,
  decodeFrame,
  type BrowserApprovalRequest,
  type BrowserDownloadState,
  type BrowserEngineStatus,
  type BrowserFrameHeader,
  type BrowserInputEvent,
  type BrowserStreamMessage,
  type BrowserTabView,
} from "../../browser/protocol.ts"
import { workbenchSocket } from "../runtime-api.ts"

export interface BrowserConnectionState {
  readonly status: "connecting" | "open" | "closed"
  readonly engine?: BrowserEngineStatus
  readonly tabs: readonly BrowserTabView[]
  readonly attachedTabId?: string
  readonly downloads: readonly BrowserDownloadState[]
  readonly approvals: readonly BrowserApprovalRequest[]
  readonly error?: string
}

const INITIAL: BrowserConnectionState = { status: "connecting", tabs: [], downloads: [], approvals: [] }

/** Backoff schedule; the last entry repeats for as long as the host is down. */
const RECONNECT_DELAYS = [400, 800, 1600, 3200, 5000] as const

export type FrameHandler = (header: BrowserFrameHeader, payload: Uint8Array) => void

export class BrowserConnection {
  private socket?: WebSocket
  private state: BrowserConnectionState = INITIAL
  private readonly listeners = new Set<() => void>()
  private queued: BrowserInputEvent[] = []
  private closed = false
  private attempt = 0
  private retry?: ReturnType<typeof setTimeout>

  constructor(private readonly onFrame: FrameHandler, private readonly sessionId?: string) {
    this.connect()
  }

  getSnapshot = (): BrowserConnectionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(patch: Partial<BrowserConnectionState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private connect(): void {
    const socket = new WebSocket(workbenchSocket(BROWSER_STREAM_PATH))
    socket.binaryType = "arraybuffer"
    this.socket = socket
    socket.addEventListener("open", () => {
      this.attempt = 0
      this.update({ status: "open", error: undefined })
      // The host owns the tabs, so reattaching restores the same page rather
      // than starting over — a dropped socket costs nothing but a repaint.
      this.send({ kind: "attach", ...(this.sessionId === undefined ? {} : { sessionId: this.sessionId }) })
      const pending = this.queued
      this.queued = []
      for (const event of pending) this.send(event)
    })
    socket.addEventListener("message", event => { this.receive(event.data as ArrayBuffer | string) })
    socket.addEventListener("close", () => {
      this.socket = undefined
      if (this.closed) return
      this.update({ status: "closed" })
      const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)] ?? 5000
      this.attempt += 1
      this.retry = setTimeout(() => { this.connect() }, delay)
    })
  }

  private receive(data: ArrayBuffer | string): void {
    if (typeof data !== "string") {
      const frame = decodeFrame(new Uint8Array(data))
      if (frame !== undefined) this.onFrame(frame.header, frame.payload)
      return
    }
    let message: BrowserStreamMessage
    try { message = JSON.parse(data) as BrowserStreamMessage } catch { return }
    switch (message.kind) {
      case "attached": this.update({ attachedTabId: message.tabId }); return
      case "tabs": this.update({ tabs: message.tabs }); return
      case "engine": this.update({ engine: message.status }); return
      case "downloads": this.update({ downloads: message.downloads }); return
      case "approval": this.update({ approvals: [...this.state.approvals, message.request] }); return
      case "approvalResolved":
        this.update({ approvals: this.state.approvals.filter(request => request.id !== message.id) })
        return
      case "clipboard":
        void navigator.clipboard?.writeText(message.text).catch(() => { /* denied */ })
        return
      case "error": this.update({ error: message.message }); return
    }
  }

  send(event: BrowserInputEvent): void {
    const socket = this.socket
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      // Only intent-carrying events are worth replaying after a reconnect.
      if (event.kind !== "ack" && event.kind !== "mouse") this.queued.push(event)
      return
    }
    socket.send(JSON.stringify(event))
  }

  close(): void {
    this.closed = true
    if (this.retry !== undefined) clearTimeout(this.retry)
    this.retry = undefined
    this.socket?.close()
    this.socket = undefined
    this.listeners.clear()
  }
}
