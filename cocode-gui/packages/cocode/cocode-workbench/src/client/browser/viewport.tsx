/**
 * The remote viewport.
 *
 * A canvas plus a one-pixel offscreen textarea. The textarea exists only to
 * own keyboard focus, because composition, copy and paste are delivered to the
 * focused editable element — forwarding raw keystrokes instead would put the
 * IME candidate window on this page and send the remote page nonsense.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { BrowserFrameHeader, BrowserInputEvent, BrowserModifier } from "../../browser/protocol.ts"
import css from "./browser.module.css"

export interface ViewportProps {
  readonly send: (event: BrowserInputEvent) => void
  readonly registerFrameSink: (sink: (header: BrowserFrameHeader, payload: Uint8Array) => void) => void
  readonly active: boolean
  /** Host tab id once attach has finished; undefined across reconnects. */
  readonly attachedTabId?: string
  /** Changes on every attach so a same-tab re-attach still restarts the stream. */
  readonly attachSeq: number
  /** Hide the canvas while the themed start page covers about:blank. */
  readonly hidden?: boolean
}

function modifiersOf(event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): BrowserModifier[] {
  const list: BrowserModifier[] = []
  if (event.altKey) list.push("alt")
  if (event.ctrlKey) list.push("ctrl")
  if (event.metaKey) list.push("meta")
  if (event.shiftKey) list.push("shift")
  return list
}

const MOUSE_BUTTONS = ["left", "middle", "right"] as const

export function BrowserViewport(props: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keyboardRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const [preedit, setPreedit] = useState("")
  const [caret, setCaret] = useState({ x: 16, y: 16 })
  const { send, registerFrameSink, active, attachedTabId, attachSeq, hidden } = props
  const attached = attachedTabId !== undefined

  // Paint and only then ack: the ack is the flow-control signal, so acking on
  // arrival would let Chromium outrun the renderer. Dropped frames must still
  // ack, otherwise Chromium waits forever and the canvas stays black.
  useEffect(() => {
    let disposed = false
    const ack = (seq: number): void => { send({ kind: "ack", seq }) }
    registerFrameSink((header, payload) => {
      const canvas = canvasRef.current
      if (canvas === null || disposed) { ack(header.seq); return }
      const context = canvas.getContext("2d")
      if (context === null) { ack(header.seq); return }
      void createImageBitmap(new Blob([payload as BlobPart], { type: "image/jpeg" })).then(bitmap => {
        if (disposed) { bitmap.close(); ack(header.seq); return }
        if (canvas.width !== header.width || canvas.height !== header.height) {
          canvas.width = header.width
          canvas.height = header.height
        }
        context.drawImage(bitmap, 0, 0)
        bitmap.close()
        ack(header.seq)
      }, () => { ack(header.seq) })
    })
    return () => { disposed = true }
  }, [registerFrameSink, send])

  // Report the element's own size so the remote page lays out for what the
  // user actually sees. Re-send after every attach: a reconnect builds a new
  // screencast that still has the default viewport until it hears from us.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || !attached) return
    const report = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      send({
        kind: "viewport",
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        deviceScaleFactor: window.devicePixelRatio,
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(canvas)
    return () => { observer.disconnect() }
  }, [send, attachedTabId, attachSeq, attached])

  useEffect(() => {
    if (!attached) return
    send({ kind: "subscribe", enabled: active })
    return () => { send({ kind: "subscribe", enabled: false }) }
  }, [active, send, attachedTabId, attachSeq, attached])

  const pointer = useCallback((type: "move" | "down" | "up") => (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (type === "down") {
      keyboardRef.current?.focus()
      setCaret({ x, y })
    }
    send({
      kind: "mouse",
      type,
      x,
      y,
      button: MOUSE_BUTTONS[event.button] ?? "left",
      buttons: event.buttons,
      clickCount: type === "move" ? 0 : event.detail || 1,
      modifiers: modifiersOf(event),
    })
  }, [send])

  const onWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    send({
      kind: "mouse",
      type: "wheel",
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      deltaX: -event.deltaX,
      deltaY: -event.deltaY,
      modifiers: modifiersOf(event),
    })
  }, [send])

  const onKey = useCallback((type: "down" | "up") => (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // A key that belongs to an active composition is not a key press.
    if (composingRef.current || event.nativeEvent.isComposing) return
    if (event.key === "Tab" || event.key === " " || event.key === "Backspace") event.preventDefault()
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey
    send({
      kind: "key",
      type,
      key: event.key,
      code: event.code,
      modifiers: modifiersOf(event),
      ...(printable && type === "down" ? { text: event.key } : {}),
    })
  }, [send])

  return <div className={css.viewport} data-hidden={hidden ? "" : undefined}>
    <canvas
      ref={canvasRef}
      className={css.canvas}
      hidden={hidden}
      onPointerMove={pointer("move")}
      onPointerDown={pointer("down")}
      onPointerUp={pointer("up")}
      onWheel={onWheel}
      onContextMenu={event => { event.preventDefault() }}
    />
    <textarea
      ref={keyboardRef}
      className={css.keyboard}
      style={{ left: caret.x, top: caret.y }}
      data-composing={preedit === "" ? undefined : true}
      aria-label="Browser keyboard input"
      value={preedit}
      onChange={() => { /* value is driven by composition events only */ }}
      onKeyDown={onKey("down")}
      onKeyUp={onKey("up")}
      onCompositionStart={() => { composingRef.current = true }}
      onCompositionUpdate={event => { setPreedit(event.data) }}
      onCompositionEnd={event => {
        composingRef.current = false
        setPreedit("")
        if (event.data !== "") send({ kind: "text", text: event.data })
      }}
      onPaste={event => {
        event.preventDefault()
        const text = event.clipboardData.getData("text/plain")
        if (text !== "") send({ kind: "text", text })
      }}
      onCopy={event => { event.preventDefault(); send({ kind: "copy" }) }}
      onCut={event => { event.preventDefault(); send({ kind: "copy" }) }}
    />
  </div>
}
