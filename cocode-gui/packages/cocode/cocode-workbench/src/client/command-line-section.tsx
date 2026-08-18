import { useEffect, useState, useSyncExternalStore } from "react"
import { Button } from "@deepseek-ai/dsh-client-ui-primitives"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import type { TuiCommandLineToolStatus } from "../../../../../src/contracts/ipc/tui.contract.ts"
import { localeRevision, subscribeLocale, t } from "./locales.ts"
import css from "./command-line-section.module.css"

export function CommandLineSection(): JSX.Element {
  useSyncExternalStore(subscribeLocale, localeRevision, localeRevision)
  const zh = t("commandLine.title") === "命令行工具"
  const api = getDesktopApi()?.tui
  const [status, setStatus] = useState<TuiCommandLineToolStatus | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  const refresh = (): void => {
    if (api === undefined) return
    void api.getCommandLineToolStatus().then(setStatus, (error: unknown) => setMessage(safeMessage(error)))
  }

  useEffect(() => {
    if (api === undefined) return
    void api.getCommandLineToolStatus().then(setStatus, (error: unknown) => setMessage(safeMessage(error)))
  }, [api])

  const repair = (): void => {
    if (api === undefined || busy) return
    setBusy(true)
    setMessage(undefined)
    void api.repairCommandLineTool()
      .then((result) => {
        setStatus(result.status)
        setMessage(result.changed ? successMessage() : result.status.detail ?? statusMessage(result.status))
      }, (error: unknown) => setMessage(safeMessage(error)))
      .finally(() => setBusy(false))
  }

  const openInTerminal = (): void => {
    if (api === undefined || busy) return
    setBusy(true)
    setMessage(undefined)
    void api.openInTerminal()
      .then(() => setMessage(t("commandLine.opened")), (error: unknown) => setMessage(safeMessage(error)))
      .finally(() => setBusy(false))
  }

  const copyDiagnostics = (): void => {
    if (status === undefined || busy) return
    setBusy(true)
    setMessage(undefined)
    void navigator.clipboard.writeText(JSON.stringify(status, null, 2))
      .then(() => setMessage(t("commandLine.diagnosticsCopied")), (error: unknown) => setMessage(safeMessage(error)))
      .finally(() => setBusy(false))
  }

  if (api === undefined) {
    return <section className={css.section}>
      <h2 className={css.title}>{t("commandLine.title")}</h2>
      <p>{t("commandLine.unavailable")}</p>
    </section>
  }

  return <section className={css.section}>
    <h2 className={css.title}>{t("commandLine.title")}</h2>
    <p className={css.description}>{t("commandLine.description")}</p>
    <div className={css.grid}>
      <Metric label={t("commandLine.status")} value={statusLabel(status, zh)} />
      <Metric label={t("commandLine.path")} value={status?.path ?? "—"} />
      <Metric label={t("commandLine.pathDir")} value={status === undefined ? "—" : status.directoryOnPath ? t("commandLine.available") : t("commandLine.notDetected")} />
      <Metric label={t("commandLine.persistentPath")} value={status === undefined ? "—" : status.persistentPathConfigured ? t("commandLine.registered") : t("commandLine.notRegistered")} />
      <Metric label={t("commandLine.registration")} value={registrationLabel(status, zh)} />
      <Metric label={t("commandLine.runtime")} value={runtimeLabel(status, zh)} />
    </div>
    {status?.detail !== undefined && <p className={css.notice}>{status.detail}</p>}
    {status !== undefined && !status.directoryOnPath && <p className={css.notice}>{t("commandLine.ensurePath", { path: status.directory })}</p>}
    {status !== undefined && status.persistentPathConfigured && !status.directoryOnPath && <p className={css.notice}>{t("commandLine.refreshProcess")}</p>}
    <div className={css.actions}>
      <Button variant="outline" size="sm" className={css.actionButton} disabled={busy || status?.canRepair !== true} onClick={repair}>{t("commandLine.repair")}</Button>
      <Button variant="outline" size="sm" className={css.actionButton} disabled={busy} onClick={openInTerminal}>{t("commandLine.open")}</Button>
      <Button variant="outline" size="sm" className={css.actionButton} disabled={busy} onClick={refresh}>{t("commandLine.refresh")}</Button>
      <Button variant="outline" size="sm" className={css.actionButton} disabled={busy || status === undefined} onClick={copyDiagnostics}>{t("commandLine.copyDiagnostics")}</Button>
    </div>
    {message !== undefined && <p role="status" className={css.notice}>{message}</p>}
  </section>
}

function getDesktopApi(): DesktopApi | undefined {
  return (window as Window & { readonly desktopApi?: DesktopApi }).desktopApi
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return <div className={css.metric}><span className={css.metricLabel}>{label}</span><strong className={css.metricValue}>{value}</strong></div>
}

function statusLabel(status: TuiCommandLineToolStatus | undefined, zh: boolean): string {
  if (status === undefined) return "—"
  if (!zh) return status.state
  return {
    installed: t("commandLine.installed"),
    missing: t("commandLine.missing"),
    stale: t("commandLine.stale"),
    conflict: t("commandLine.conflict"),
    unavailable: t("commandLine.unavailableState"),
  }[status.state]
}

function statusMessage(status: TuiCommandLineToolStatus): string {
  if (status.state === "conflict") return t("commandLine.conflictDetail")
  return statusLabel(status, t("commandLine.title") === "命令行工具")
}

function registrationLabel(status: TuiCommandLineToolStatus | undefined, zh: boolean): string {
  if (status === undefined) return "—"
  if (!zh) return status.registrationSource
  return {
    installer: t("commandLine.installer"),
    "desktop-startup": t("commandLine.desktopStartup"),
    manual: t("commandLine.manual"),
    unknown: t("commandLine.unknown"),
  }[status.registrationSource]
}

function runtimeLabel(status: TuiCommandLineToolStatus | undefined, zh: boolean): string {
  if (status === undefined) return "—"
  if (!status.runtimeValid) return zh ? "不可用" : "Invalid"
  const version = status.tuiVersion ?? status.runtimeVersion
  return version === undefined ? (zh ? "有效" : "Valid") : version
}

function successMessage(): string { return t("commandLine.repaired") }

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
