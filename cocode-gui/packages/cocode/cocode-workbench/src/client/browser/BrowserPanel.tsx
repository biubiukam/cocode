/**
 * Browser panel.
 *
 * The page is a canvas in the DOM rather than a native view, which is why this
 * component has no carrier branch at all: Electron and a plain browser tab run
 * the exact same code, and nothing here can be occluded by a native layer.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { WorkbenchPanelProps } from "../model.ts"
import type { BrowserFrameHeader, BrowserInputEvent } from "../../browser/protocol.ts"
import { BrowserConnection } from "./connection.ts"
import { BrowserToolbar } from "./toolbar.tsx"
import { BrowserViewport } from "./viewport.tsx"
import { BrowserStartPage } from "./start-page.tsx"
import { t } from "../locales.ts"
import css from "./browser.module.css"

type FrameSink = (header: BrowserFrameHeader, payload: Uint8Array) => void

/** A panel opened to show a tab that already exists carries its id here. */
function adoptedTabId(target: WorkbenchPanelProps["instance"]["target"]): string | undefined {
  const data = target?.data
  if (typeof data !== "object" || data === null) return undefined
  const tabId = (data as { tabId?: unknown }).tabId
  return typeof tabId === "string" ? tabId : undefined
}

export function BrowserPanel(props: WorkbenchPanelProps) {
  const panelId = props.instance.id
  const adopt = adoptedTabId(props.instance.target)
  const sink = useRef<FrameSink>()
  const addressRef = useRef<HTMLInputElement>(null)
  const connection = useMemo(() => {
    const conn: BrowserConnection = new BrowserConnection((header, payload) => {
      const current = sink.current
      if (current === undefined) {
        conn.send({ kind: "ack", seq: header.seq })
        return
      }
      current(header, payload)
    }, panelId, adopt)
    return conn
  }, [panelId, adopt])
  // Closing the panel closes the page; a reload never runs this and so keeps it.
  useEffect(() => () => { connection.release() }, [connection])
  useEffect(() => { connection.setSession(props.scope.sessionId) }, [connection, props.scope.sessionId])

  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot)
  const send = useCallback((event: BrowserInputEvent) => { connection.send(event) }, [connection])
  const registerFrameSink = useCallback((next: FrameSink) => { sink.current = next }, [])

  const initial = props.instance.target?.url
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || initial === undefined || state.attachedTabId === undefined) return
    opened.current = true
    send({ kind: "navigate", url: initial })
  }, [initial, send, state.attachedTabId])

  // A browser tab is a workbench tab, so showing a page nothing is showing yet
  // means opening another panel beside this one.
  const showTab = useCallback((tabId: string) => {
    props.open("browser", {
      dock: props.instance.dock,
      ...(props.instance.paneId === undefined ? {} : { paneId: props.instance.paneId }),
      target: { data: { tabId } },
    })
  }, [props])

  const active = state.tab
  const engine = state.engine
  const showStartPage = active?.url === "about:blank" && active.loading !== true
  const focusAddress = useCallback(() => {
    addressRef.current?.focus()
    addressRef.current?.select()
  }, [])

  if (engine !== undefined && !engine.ready) {
    return <EngineGate
      installable={engine.installable}
      installing={engine.installing?.note}
      message={engine.message}
      onInstall={() => { send({ kind: "install" }) }}
    />
  }

  return <div className={css.panel}>
    <BrowserToolbar tab={active} send={send} addressRef={addressRef} />
    {state.status === "open" ? null : <div className={css.notice}>{t(state.status === "connecting" ? "browser.connecting" : "browser.reconnecting")}</div>}
    {state.error === undefined ? null : <div className={css.error}>{state.error}</div>}
    {state.detached.map(tab => <div key={tab.id} className={css.notice}>
      <span className={css.title}>{t("browser.detachedTab", { title: tab.title === "" ? tab.url : tab.title })}</span>
      <button type="button" onClick={() => { showTab(tab.id) }}>{t("browser.showTab")}</button>
    </div>)}
    {state.approvals.map(request => <div key={request.id} className={css.approval}>
      <span className={css.approvalText}>{t("browser.agentWants", { summary: request.summary })}</span>
      <button type="button" onClick={() => { send({ kind: "approve", id: request.id, granted: true }) }}>{t("browser.allow")}</button>
      <button type="button" onClick={() => { send({ kind: "approve", id: request.id, granted: false }) }}>{t("browser.deny")}</button>
    </div>)}
    {active?.dialog === undefined ? null : <DialogBar
      kind={active.dialog.kind}
      message={active.dialog.message}
      defaultValue={active.dialog.defaultValue}
      send={send}
    />}
    <div className={css.viewportShell}>
      <BrowserViewport
        send={send}
        registerFrameSink={registerFrameSink}
        active={props.visible}
        attachedTabId={state.attachedTabId}
        attachSeq={state.attachSeq}
        hidden={showStartPage}
      />
      {showStartPage ? <BrowserStartPage onFocusAddress={focusAddress} /> : null}
    </div>
    {state.downloads.filter(download => download.state === "active").map(download => <div key={download.id} className={css.download}>
      <span className={css.title}>{t("browser.downloadingFile", { name: download.filename })}</span>
      <button type="button" onClick={() => { send({ kind: "cancelDownload", id: download.id }) }}>{t("common.cancel")}</button>
    </div>)}
  </div>
}

function DialogBar(props: {
  readonly kind: string
  readonly message: string
  readonly defaultValue?: string
  readonly send: (event: BrowserInputEvent) => void
}) {
  const [reply, setReply] = useState(props.defaultValue ?? "")
  return <div className={css.dialog}>
    <span className={css.approvalText}>{props.kind}: {props.message}</span>
    {props.kind !== "prompt" ? null : <input aria-label={props.message} value={reply} onChange={event => { setReply(event.target.value) }} />}
    <button type="button" onClick={() => { props.send({ kind: "dialog", accept: true, ...(props.kind === "prompt" ? { text: reply } : {}) }) }}>{t("common.confirm")}</button>
    {props.kind === "alert" ? null : <button type="button" onClick={() => { props.send({ kind: "dialog", accept: false }) }}>{t("common.cancel")}</button>}
  </div>
}

/**
 * Nothing downloads silently. The user sees what is missing, what it costs and
 * keeps a working way out if they decline.
 */
function EngineGate(props: {
  readonly installable: boolean
  readonly installing?: string
  readonly message?: string
  readonly onInstall: () => void
}) {
  const installing = props.installing !== undefined
  return <div className={css.gate}>
    <p className={css.gateTitle}>{installing ? t("browser.downloading") : props.message ?? t("browser.searching")}</p>
    {installing ? <p className={css.gateBody}>{t("browser.downloadOnce")}</p> : null}
    {!installing && props.installable ? <>
      <p className={css.gateBody}>{t("browser.needEngine")}</p>
      <button type="button" className={css.gateAction} onClick={props.onInstall}>{t("browser.install")}</button>
    </> : null}
  </div>
}
