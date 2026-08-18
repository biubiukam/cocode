import { useEffect, useState, useSyncExternalStore } from "react"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import type { TuiCommandLineToolStatus } from "../../../../../src/contracts/ipc/tui.contract.ts"
import { localeRevision, subscribeLocale, t } from "./locales.ts"
import css from "./command-line-section.module.css"

/** Settings page showing the versions of the Cocode desktop and bundled DSH runtime. */
export function VersionSection(): JSX.Element {
  useSyncExternalStore(subscribeLocale, localeRevision, localeRevision)
  const api = getDesktopApi()?.tui
  const [status, setStatus] = useState<TuiCommandLineToolStatus | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (api === undefined) return
    void api.getCommandLineToolStatus().then(setStatus, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [api])

  return <section className={css.section}>
    <h2 className={css.title}>{t("version.title")}</h2>
    <p className={css.description}>{t("version.description")}</p>
    <div className={css.grid}>
      <Metric label={t("version.cocode")} value={status?.appVersion ?? "—"} />
      <Metric label={t("version.dsh")} value={status?.runtimeVersion ?? "—"} />
    </div>
    {error !== undefined && <p role="status" className={css.notice}>{error}</p>}
  </section>
}

function getDesktopApi(): DesktopApi | undefined {
  return (window as Window & { readonly desktopApi?: DesktopApi }).desktopApi
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return <div className={css.metric}><span className={css.metricLabel}>{label}</span><strong className={css.metricValue}>{value}</strong></div>
}
