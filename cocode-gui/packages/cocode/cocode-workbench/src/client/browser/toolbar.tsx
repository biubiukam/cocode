/**
 * Address bar and tab strip. All state is a projection of what the host
 * reports, so the toolbar cannot drift from the page the way a locally
 * maintained history array does.
 */
import { useEffect, useState } from "react"
import type { BrowserInputEvent, BrowserTabView } from "../../browser/protocol.ts"
import { t } from "../locales.ts"
import css from "./browser.module.css"

export interface ToolbarProps {
  readonly tabs: readonly BrowserTabView[]
  readonly activeTabId?: string
  readonly send: (event: BrowserInputEvent) => void
}

export function BrowserToolbar(props: ToolbarProps) {
  const active = props.tabs.find(tab => tab.id === props.activeTabId)
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState(false)

  // Follow the page unless the user is mid-edit, which would otherwise fight typing.
  useEffect(() => {
    if (!editing) setDraft(active?.url === "about:blank" ? "" : active?.url ?? "")
  }, [active?.url, editing])

  return <div className={css.chrome}>
    <div className={css.toolbar}>
      <button type="button" className={css.navButton} title={t("browser.back")} disabled={active?.canGoBack !== true} onClick={() => { props.send({ kind: "navigate", to: "back" }) }}>‹</button>
      <button type="button" className={css.navButton} title={t("browser.forward")} disabled={active?.canGoForward !== true} onClick={() => { props.send({ kind: "navigate", to: "forward" }) }}>›</button>
      <button type="button" className={css.navButton} title={active?.loading === true ? t("browser.stop") : t("browser.reload")} onClick={() => { props.send({ kind: "navigate", to: "reload" }) }}>{active?.loading === true ? "×" : "⟳"}</button>
      <form
        className={css.addressForm}
        onSubmit={event => {
          event.preventDefault()
          setEditing(false)
          if (draft.trim() !== "") props.send({ kind: "navigate", url: draft.trim() })
        }}
      >
        <input
          className={css.address}
          aria-label={t("browser.address")}
          placeholder={t("browser.address")}
          value={draft}
          onFocus={() => { setEditing(true) }}
          onBlur={() => { setEditing(false) }}
          onChange={event => { setDraft(event.target.value) }}
        />
      </form>
      <button type="button" className={css.navButton} title={t("browser.newTab")} onClick={() => { props.send({ kind: "open", url: "about:blank" }) }}>+</button>
      {active === undefined ? null : <button
        type="button"
        className={css.navButton}
        title={t("browser.openExternal")}
        onClick={() => { window.open(active.url, "_blank", "noopener,noreferrer") }}
      >↗</button>}
    </div>
    {props.tabs.length <= 1 ? null : <div className={css.tabs}>
      {props.tabs.map(tab => <button
        key={tab.id}
        type="button"
        className={css.tab}
        data-active={tab.id === props.activeTabId || undefined}
        data-owner={tab.owner}
        onClick={() => { props.send({ kind: "attach", tabId: tab.id }) }}
      >
        <span className={css.tabTitle}>{tab.title === "" ? tab.url : tab.title}</span>
        {tab.owner === "agent" ? <span className={css.tabBadge}>{t("browser.agentTab")}</span> : null}
        <span
          role="button"
          tabIndex={0}
          title={t("browser.closeTab")}
          className={css.tabClose}
          onClick={event => { event.stopPropagation(); props.send({ kind: "closeTab", tabId: tab.id }) }}
          onKeyDown={event => { if (event.key === "Enter") props.send({ kind: "closeTab", tabId: tab.id }) }}
        >×</span>
      </button>)}
    </div>}
  </div>
}
