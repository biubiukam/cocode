/**
 * Panel side of the terminal socket: one shell, kept attached across host
 * restarts and network hiccups. The host owns the process, so a reconnect
 * replays the transcript and resumes the same session — this class only has
 * to keep a socket alive, translate frames, and stop retrying when retrying
 * cannot help (the shell exited, the host refused, another window took over).
 */
import {
  parseTerminalMessage,
  TERMINAL_REFUSED_CODE,
  TERMINAL_SOCKET_PATH,
  TERMINAL_SUPERSEDED_CODE,
  type TerminalClientMessage,
  type TerminalHostMessage,
} from "../terminal-wire.ts"
import { workbenchCwd, workbenchSocket } from "./runtime-api.ts"

/** Backoff schedule; the last entry repeats for as long as the host is down. */
const RECONNECT_DELAYS = [400, 800, 1600, 3200, 5000] as const

export type TerminalStatus =
  | { readonly kind: "connecting" }
  | { readonly kind: "ready"; readonly cwd: string; readonly shell: string }
  | { readonly kind: "reconnecting" }
  | { readonly kind: "exited"; readonly code: number }
  /** Another panel owns this terminal now; this one must stay quiet. */
  | { readonly kind: "superseded" }
  /** The host declined, `reason` being its own explanation when it gave one. */
  | { readonly kind: "refused"; readonly reason?: string }

export interface TerminalConnectionOptions {
  readonly sessionId: string
  readonly terminalId: string
  /** Geometry to spawn with, sampled at every (re)connect. */
  geometry(): { cols: number; rows: number }
  onOutput(text: string): void
  onStatus(status: TerminalStatus): void
}

export class TerminalConnection {
  readonly #options: TerminalConnectionOptions
  readonly #decoder = new TextDecoder()
  readonly #encoder = new TextEncoder()
  #socket: WebSocket | undefined
  #retry: ReturnType<typeof setTimeout> | undefined
  #attempt = 0
  #disposed = false
  /** Retrying cannot help any more; only an explicit restart resumes. */
  #settled = false

  constructor(options: TerminalConnectionOptions) {
    this.#options = options
  }

  /** Open the socket; safe to call once per mount. */
  connect(): void {
    this.#open(false)
  }

  /** Kill the shell behind this panel and start a new one. */
  restart(): void {
    this.#attempt = 0
    this.#open(true)
  }

  /** Forward keystrokes as raw terminal bytes. */
  send(data: string): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(this.#encoder.encode(data))
  }

  resize(cols: number, rows: number): void {
    this.#control({ type: "resize", cols, rows })
  }

  /** Drop the socket; the host keeps the shell for its reconnect grace. */
  dispose(): void {
    this.#disposed = true
    this.#clearRetry()
    this.#close()
  }

  #open(restart: boolean): void {
    if (this.#disposed) return
    this.#clearRetry()
    this.#settled = false
    this.#close()
    this.#options.onStatus(this.#attempt === 0 ? { kind: "connecting" } : { kind: "reconnecting" })
    const socket = new WebSocket(this.#url(restart))
    socket.binaryType = "arraybuffer"
    this.#socket = socket
    socket.onmessage = event => { this.#receive(event.data) }
    socket.onclose = event => { this.#closed(event) }
  }

  #url(restart: boolean): string {
    const size = this.#options.geometry()
    const query = new URLSearchParams({
      sessionId: this.#options.sessionId,
      terminal: this.#options.terminalId,
      cols: String(size.cols),
      rows: String(size.rows),
    })
    if (restart) query.set("restart", "1")
    const cwd = workbenchCwd()
    if (cwd !== undefined) query.set("cwd", cwd)
    return workbenchSocket(`${TERMINAL_SOCKET_PATH}?${query.toString()}`)
  }

  #receive(data: unknown): void {
    if (typeof data !== "string") {
      this.#options.onOutput(this.#decoder.decode(data as ArrayBuffer, { stream: true }))
      return
    }
    const message = parseTerminalMessage<TerminalHostMessage>(data)
    if (message === undefined) return
    if (message.type === "attached") {
      this.#attempt = 0
      this.#options.onStatus({ kind: "ready", cwd: message.cwd, shell: message.shell })
      return
    }
    if (message.type === "exit") {
      this.#settled = true
      this.#options.onStatus({ kind: "exited", code: message.code })
      return
    }
    this.#settled = true
    this.#options.onStatus({ kind: "superseded" })
  }

  #closed(event: CloseEvent): void {
    this.#socket = undefined
    if (this.#disposed) return
    if (event.code === TERMINAL_SUPERSEDED_CODE) return
    // Only a refusal is final. Every other close — a host restart, a dropped
    // network, a reloaded page — leaves a shell the reconnect can pick up.
    if (event.code === TERMINAL_REFUSED_CODE) {
      this.#settled = true
      this.#options.onStatus(event.reason === "" ? { kind: "refused" } : { kind: "refused", reason: event.reason })
      return
    }
    if (this.#settled) return
    this.#options.onStatus({ kind: "reconnecting" })
    const delay = RECONNECT_DELAYS[Math.min(this.#attempt, RECONNECT_DELAYS.length - 1)] ?? 5000
    this.#attempt += 1
    this.#retry = setTimeout(() => { this.#open(false) }, delay)
  }

  #control(message: TerminalClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message))
  }

  #close(): void {
    const socket = this.#socket
    this.#socket = undefined
    if (socket === undefined) return
    socket.onmessage = null
    socket.onclose = null
    socket.close()
  }

  #clearRetry(): void {
    if (this.#retry === undefined) return
    clearTimeout(this.#retry)
    this.#retry = undefined
  }
}
