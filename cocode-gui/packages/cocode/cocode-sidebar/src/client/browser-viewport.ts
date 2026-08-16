/**
 * The viewport's half of the browser transport: one reconnecting WebSocket,
 * frame decoding, and the input translation that turns DOM events into the
 * CDP vocabulary the host forwards to Chromium.
 *
 * Kept out of the React component so the translation rules — which are where
 * the subtle bugs live (modifier masks, IME composition, wheel deltas) — are
 * plain functions that can be reasoned about and tested without a DOM.
 */
import type {
  BrowserClientFrame,
  BrowserDialog,
  BrowserEngineStatus,
  BrowserFrameHeader,
  BrowserServerFrame,
  BrowserTabState,
} from '../browser/protocol.ts'
import { desktopRuntimeUrl } from './desktop-runtime.ts'

/** Reconnect delay after the socket drops. */
const RECONNECT_MS = 2_000

/** CDP modifier bits, which do not match any DOM constant. */
const ALT = 1
const CONTROL = 2
const META = 4
const SHIFT = 8

/** Sinks the component installs on the connection. */
export interface ViewportHandlers {
  frame(header: BrowserFrameHeader, jpeg: Blob): void
  state(state: BrowserTabState): void
  engine(status: BrowserEngineStatus): void
  dialog(dialog: BrowserDialog | null): void
  download(name: string, path: string): void
  copy(text: string): void
  error(code: string, message: string): void
  connected(open: boolean): void
}

/**
 * Split one binary frame into its JSON header and the JPEG bytes. The layout
 * is a 4-byte big-endian header length, the UTF-8 header, then the payload
 * (see the host's `encodeFrame`).
 */
export function decodeFrame(buffer: ArrayBuffer): { header: BrowserFrameHeader; jpeg: Blob } | undefined {
  if (buffer.byteLength < 4) return undefined
  const view = new DataView(buffer)
  const metaLength = view.getUint32(0)
  if (metaLength + 4 > buffer.byteLength) return undefined
  try {
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, metaLength))) as BrowserFrameHeader
    return { header, jpeg: new Blob([new Uint8Array(buffer, 4 + metaLength)], { type: 'image/jpeg' }) }
  } catch {
    return undefined
  }
}

/** A reconnecting connection to one browser tab's viewport channel. */
export class BrowserConnection {
  private socket: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    private readonly query: { sessionId: string; tabId: string },
    private readonly handlers: ViewportHandlers,
  ) {
    this.connect()
  }

  private connect(): void {
    if (this.closed) return
    const url = new URL(desktopRuntimeUrl('/sidebar/ws/browser'), location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.search = new URLSearchParams({ sessionId: this.query.sessionId, tab: this.query.tabId }).toString()
    const socket = new WebSocket(url.toString())
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.onopen = () => { this.handlers.connected(true) }
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => { this.receive(event.data) }
    socket.onclose = () => {
      this.handlers.connected(false)
      if (this.closed) return
      this.retry = setTimeout(() => { this.connect() }, RECONNECT_MS)
    }
    socket.onerror = () => { socket.close() }
  }

  private receive(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      const decoded = decodeFrame(data)
      if (decoded !== undefined) this.handlers.frame(decoded.header, decoded.jpeg)
      return
    }
    let frame: BrowserServerFrame
    try {
      frame = JSON.parse(data) as BrowserServerFrame
    } catch {
      return
    }
    switch (frame.t) {
      case 'state': this.handlers.state(frame.state); return
      case 'engine': this.handlers.engine(frame.status); return
      case 'dialog': this.handlers.dialog(frame.dialog); return
      case 'download': this.handlers.download(frame.name, frame.path); return
      case 'copy': this.handlers.copy(frame.text); return
      case 'error': this.handlers.error(frame.code, frame.message); return
    }
  }

  /** Send one frame; silently dropped while the socket is down. */
  send(frame: BrowserClientFrame): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(frame))
  }

  /** Stop reconnecting and drop the socket. */
  dispose(): void {
    this.closed = true
    if (this.retry !== undefined) clearTimeout(this.retry)
    this.socket?.close()
    this.socket = null
  }
}

// ── Input translation ───────────────────────────────────────────────────────

/** The modifier flags of any DOM event, as CDP's bitmask. */
export function modifiersOf(event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  return (event.altKey ? ALT : 0) | (event.ctrlKey ? CONTROL : 0) | (event.metaKey ? META : 0) | (event.shiftKey ? SHIFT : 0)
}

/** CDP's button names, indexed by the DOM's numeric button. */
const BUTTONS = ['left', 'middle', 'right'] as const

/**
 * Map a pointer position on the canvas element into CSS pixels of the remote
 * page. The two are normally 1:1 — the host resizes the page to the canvas —
 * but a click landing between a resize and its first frame must still hit
 * the right place, so the ratio is applied rather than assumed.
 */
export function pointOf(
  event: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  page: { cssWidth: number; cssHeight: number },
): { x: number; y: number } {
  const scaleX = rect.width === 0 ? 1 : page.cssWidth / rect.width
  const scaleY = rect.height === 0 ? 1 : page.cssHeight / rect.height
  return {
    x: Math.round((event.clientX - rect.left) * scaleX),
    y: Math.round((event.clientY - rect.top) * scaleY),
  }
}

/** Build one mouse frame from a DOM pointer event. */
export function mouseFrameOf(
  kind: 'move' | 'down' | 'up',
  event: MouseEvent,
  point: { x: number; y: number },
): BrowserClientFrame {
  return {
    t: 'mouse',
    kind,
    x: point.x,
    y: point.y,
    button: kind === 'move' ? 'none' : (BUTTONS[event.button] ?? 'left'),
    buttons: event.buttons,
    clickCount: kind === 'move' ? 0 : event.detail || 1,
    modifiers: modifiersOf(event),
  }
}

/** Build one wheel frame, normalizing the browser's three delta modes to pixels. */
export function wheelFrameOf(event: WheelEvent, point: { x: number; y: number }): BrowserClientFrame {
  // deltaMode 1 is lines and 2 is pages; Chromium expects pixels.
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
  return {
    t: 'mouse',
    kind: 'wheel',
    x: point.x,
    y: point.y,
    button: 'none',
    buttons: 0,
    deltaX: -event.deltaX * scale,
    deltaY: -event.deltaY * scale,
    modifiers: modifiersOf(event),
  }
}

/**
 * The printable text a keypress produces, or undefined for a control key.
 * A key held with Ctrl or Meta is a shortcut, never text — sending both
 * would insert the character AND fire the shortcut.
 */
export function textOf(event: KeyboardEvent): string | undefined {
  if (event.ctrlKey || event.metaKey) return undefined
  if (event.key === 'Enter') return '\r'
  if (event.key === 'Tab') return '\t'
  return [...event.key].length === 1 ? event.key : undefined
}

/** Build one key frame from a DOM keyboard event. */
export function keyFrameOf(kind: 'down' | 'up', event: KeyboardEvent): BrowserClientFrame {
  return {
    t: 'key',
    kind,
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    modifiers: modifiersOf(event),
    text: kind === 'down' ? textOf(event) : undefined,
  }
}

/**
 * Keys the viewport must swallow so the surrounding GUI does not react to
 * them: they belong to the remote page, which is the thing the user is
 * looking at.
 */
const CAPTURED_KEYS = new Set(['Tab', 'Backspace', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'])

/** Whether a keydown belongs to the page rather than to the GUI around it. */
export function shouldCapture(event: KeyboardEvent): boolean {
  // Browser-level shortcuts (reload, devtools, the GUI's own bindings) stay
  // with the host application; everything else goes to the page.
  if (event.metaKey || event.ctrlKey) return false
  return CAPTURED_KEYS.has(event.key) || [...event.key].length === 1
}
