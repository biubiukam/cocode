/**
 * The workbench terminal: a real pseudo terminal rendered by xterm.
 *
 * The panel instance id is the terminal's identity, so the same shell comes
 * back after a tab switch, a dock collapse or a page reload — the host keeps
 * the process and replays what was printed while nobody was listening. A
 * hidden panel keeps its terminal mounted but stops measuring, because a
 * `display: none` container reports no size and would fit the grid to zero.
 */
import { useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import type { WorkbenchPanelProps } from "./model.ts"
import { t } from "./locales.ts"
import { TerminalIcon } from "./icons.tsx"
import { State } from "./panel-state.tsx"
import { TerminalConnection, type TerminalStatus } from "./terminal-connection.ts"
import { readTerminalFont, readTerminalTheme, subscribeColorScheme } from "./terminal-theme.ts"
import css from "./terminal.module.css"

/** Lines of history one terminal keeps in the browser. */
const SCROLLBACK = 5000

interface TerminalHandles {
  readonly terminal: Terminal
  readonly fit: FitAddon
  readonly connection: TerminalConnection
}

/** Resize the grid to the container, unless the panel is hidden or unsized. */
function fitToContainer(handles: TerminalHandles, container: HTMLElement): void {
  if (container.clientWidth === 0 || container.clientHeight === 0) return
  handles.fit.fit()
}

/** Ctrl+Shift+C / Ctrl+Shift+V, which a terminal needs because Ctrl+C is a signal. */
function clipboardShortcut(terminal: Terminal, event: KeyboardEvent): boolean {
  if (event.type !== "keydown" || !event.ctrlKey || !event.shiftKey) return true
  const key = event.key.toLowerCase()
  if (key === "c" && terminal.hasSelection()) {
    void navigator.clipboard.writeText(terminal.getSelection())
    return false
  }
  if (key === "v") {
    void navigator.clipboard.readText().then(text => { terminal.paste(text) }, () => {})
    return false
  }
  return true
}

/** A running terminal says nothing; every other state explains itself. */
function statusText(status: TerminalStatus): string | undefined {
  if (status.kind === "connecting") return t("terminal.connecting")
  if (status.kind === "reconnecting") return t("terminal.reconnecting")
  if (status.kind === "exited") return t("terminal.exited", { code: status.code })
  if (status.kind === "superseded") return t("terminal.superseded")
  if (status.kind === "refused") return status.reason ?? t("terminal.refused")
  return undefined
}

function StatusBar(props: { status: TerminalStatus; onRestart: () => void }) {
  const text = statusText(props.status)
  if (text === undefined) return null
  const settled = props.status.kind !== "connecting" && props.status.kind !== "reconnecting"
  return <div className={css.status} data-tone={settled ? "settled" : "pending"}>
    <span className={css.statusText}>{text}</span>
    {settled && <button type="button" className={css.statusAction} onClick={props.onRestart}>{t("terminal.restart")}</button>}
  </div>
}

export function TerminalPanel(props: WorkbenchPanelProps) {
  const sessionId = props.scope.sessionId
  const terminalId = props.instance.id
  const containerRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<TerminalHandles>()
  const cwdRef = useRef(props.scope.cwd)
  cwdRef.current = props.scope.cwd
  const [status, setStatus] = useState<TerminalStatus>({ kind: "connecting" })

  useEffect(() => {
    const container = containerRef.current
    if (container === null || sessionId === undefined) return
    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      scrollback: SCROLLBACK,
      theme: readTerminalTheme(container),
      ...readTerminalFont(container),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    terminal.attachCustomKeyEventHandler(event => clipboardShortcut(terminal, event))

    const connection = new TerminalConnection({
      sessionId,
      terminalId,
      geometry: () => ({ cols: terminal.cols, rows: terminal.rows }),
      cwd: () => cwdRef.current,
      onOutput: text => { terminal.write(text) },
      onStatus: setStatus,
    })
    const handles: TerminalHandles = { terminal, fit, connection }
    handlesRef.current = handles
    fitToContainer(handles, container)
    connection.connect()

    terminal.onData(data => { connection.send(data) })
    terminal.onResize(({ cols, rows }) => { connection.resize(cols, rows) })

    // One frame of coalescing: a dock drag fires a resize per pointer move,
    // and refitting the grid on each of them would thrash the renderer.
    let frame: number | undefined
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        fitToContainer(handles, container)
      })
    })
    observer.observe(container)
    const unsubscribeScheme = subscribeColorScheme(() => { terminal.options.theme = readTerminalTheme(container) })

    return () => {
      unsubscribeScheme()
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      connection.dispose()
      terminal.dispose()
      handlesRef.current = undefined
    }
  }, [sessionId, terminalId])

  useEffect(() => {
    const handles = handlesRef.current
    const container = containerRef.current
    if (!props.visible || handles === undefined || container === null) return
    fitToContainer(handles, container)
    handles.terminal.focus()
  }, [props.visible, status.kind])

  if (sessionId === undefined) return <State empty={t("terminal.noSession")} icon={<TerminalIcon size={18} />} />
  return <div className={css.panel}>
    <div className={css.surface} ref={containerRef} />
    <StatusBar status={status} onRestart={() => {
      const handles = handlesRef.current
      if (handles === undefined) return
      // The dead shell's output belongs to the shell that printed it.
      handles.terminal.reset()
      handles.connection.restart()
    }} />
  </div>
}
