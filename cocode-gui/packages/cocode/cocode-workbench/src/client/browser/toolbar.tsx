/**
 * Address bar. There is no tab strip and no "new tab" button here: a workbench
 * panel drives exactly one tab, so the dock's own tabs are the browser's tabs
 * and the dock's own "+" opens the next page. All state is a projection of what
 * the host reports, so the toolbar cannot drift from the page the way a locally
 * maintained history array does.
 */
import { useEffect, useState } from "react"
import { isWebAddress, type BrowserInputEvent, type BrowserTabView } from "../../browser/protocol.ts"
import { ArrowRightIcon, ChevronIcon, ChevronLeftIcon, CloseIcon, ExternalIcon, ReloadIcon } from "../icons.tsx"
import { t } from "../locales.ts"
import css from "./browser.module.css"

export interface ToolbarProps {
  readonly tab?: BrowserTabView
  readonly send: (event: BrowserInputEvent) => void
}

export function BrowserToolbar(props: ToolbarProps) {
  const active = props.tab
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState(false)

  // Follow the page unless the user is mid-edit, which would otherwise fight typing.
  useEffect(() => {
    if (!editing) setDraft(active?.url === "about:blank" ? "" : active?.url ?? "")
  }, [active?.url, editing])

  const loading = active?.loading === true
  const address = draft.trim()
  // Refused here as well as on the host, so a typed phrase fails as "not an
  // address" instead of as a DNS error for a punycoded domain.
  const navigable = isWebAddress(address)
  // Only flagged once the user tries to go: marking every prefix as they type
  // would be wrong for most of the keystrokes that lead to a valid address.
  const [rejected, setRejected] = useState(false)
  const go = (): void => {
    setRejected(!navigable)
    if (!navigable) return
    setEditing(false)
    props.send({ kind: "navigate", url: address })
  }

  return <div className={css.toolbar}>
    <button
      type="button"
      className={css.navButton}
      title={t("browser.back")}
      disabled={active?.canGoBack !== true}
      onClick={() => { props.send({ kind: "navigate", to: "back" }) }}
    ><ChevronLeftIcon size={16} /></button>
    <button
      type="button"
      className={css.navButton}
      title={t("browser.forward")}
      disabled={active?.canGoForward !== true}
      onClick={() => { props.send({ kind: "navigate", to: "forward" }) }}
    ><ChevronIcon size={16} /></button>
    <button
      type="button"
      className={css.navButton}
      title={loading ? t("browser.stop") : t("browser.reload")}
      onClick={() => { props.send({ kind: "navigate", to: "reload" }) }}
    >{loading ? <CloseIcon size={16} /> : <ReloadIcon size={16} />}</button>
    <form className={css.addressForm} onSubmit={event => { event.preventDefault(); go() }}>
      <input
        className={css.address}
        aria-label={t("browser.address")}
        placeholder={t("browser.address")}
        title={rejected ? t("browser.addressInvalid") : undefined}
        data-invalid={rejected ? "" : undefined}
        value={draft}
        onFocus={() => { setEditing(true) }}
        onBlur={() => { setEditing(false) }}
        onChange={event => { setDraft(event.target.value); setRejected(false) }}
      />
    </form>
    {active?.owner !== "agent" ? null : <button
      type="button"
      className={css.ownerBadge}
      title={t("browser.takeOver")}
      onClick={() => { props.send({ kind: "revoke", tabId: active.id }) }}
    >{t("browser.agentTab")}</button>}
    {active === undefined ? null : <button
      type="button"
      className={css.navButton}
      title={t("browser.openExternal")}
      onClick={() => { window.open(active.url, "_blank", "noopener,noreferrer") }}
    ><ExternalIcon size={16} /></button>}
    <button
      type="button"
      className={css.navButton}
      title={t("browser.go")}
      disabled={address === ""}
      // Keep focus in the address field: blurring it first would resync the
      // draft to the current page and navigate to where we already are.
      onMouseDown={event => { event.preventDefault() }}
      onClick={go}
    ><ArrowRightIcon size={16} /></button>
  </div>
}
