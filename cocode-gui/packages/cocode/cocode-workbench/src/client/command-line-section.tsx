import { useEffect, useState, useSyncExternalStore } from "react"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import type { TuiCommandLineToolStatus } from "../../../../../src/contracts/ipc/tui.contract.ts"
import { localeRevision, subscribeLocale, t } from "./locales.ts"

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
    return <section style={styles.section}>
      <h2 style={styles.title}>{t("commandLine.title")}</h2>
      <p>{t("commandLine.unavailable")}</p>
    </section>
  }

  return <section style={styles.section}>
    <h2 style={styles.title}>{t("commandLine.title")}</h2>
    <p style={styles.description}>{t("commandLine.description")}</p>
    <div style={styles.grid}>
      <Metric label={t("commandLine.status")} value={statusLabel(status, zh)} />
      <Metric label={t("commandLine.path")} value={status?.path ?? "—"} />
      <Metric label={t("commandLine.pathDir")} value={status === undefined ? "—" : status.directoryOnPath ? t("commandLine.available") : t("commandLine.notDetected")} />
      <Metric label={t("commandLine.persistentPath")} value={status === undefined ? "—" : status.persistentPathConfigured ? t("commandLine.registered") : t("commandLine.notRegistered")} />
      <Metric label={t("commandLine.registration")} value={registrationLabel(status, zh)} />
      <Metric label={t("commandLine.runtime")} value={runtimeLabel(status, zh)} />
    </div>
    {status?.detail !== undefined && <p style={styles.notice}>{status.detail}</p>}
    {status !== undefined && !status.directoryOnPath && <p style={styles.notice}>{t("commandLine.ensurePath", { path: status.directory })}</p>}
    {status !== undefined && status.persistentPathConfigured && !status.directoryOnPath && <p style={styles.notice}>{t("commandLine.refreshProcess")}</p>}
    <div style={styles.actions}>
      <button type="button" disabled={busy || status?.canRepair !== true} onClick={repair}>{t("commandLine.repair")}</button>
      <button type="button" disabled={busy} onClick={openInTerminal}>{t("commandLine.open")}</button>
      <button type="button" disabled={busy} onClick={refresh}>{t("commandLine.refresh")}</button>
      <button type="button" disabled={busy || status === undefined} onClick={copyDiagnostics}>{t("commandLine.copyDiagnostics")}</button>
    </div>
    {message !== undefined && <p role="status" style={styles.notice}>{message}</p>}
  </section>
}

function getDesktopApi(): DesktopApi | undefined {
  return (window as Window & { readonly desktopApi?: DesktopApi }).desktopApi
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return <div style={styles.metric}><span style={styles.metricLabel}>{label}</span><strong style={styles.metricValue}>{value}</strong></div>
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

const styles = {
  section: { display: "grid", gap: "12px", maxWidth: "720px", padding: "8px 0" },
  title: { margin: 0, fontSize: "18px" },
  description: { margin: 0, opacity: 0.72, lineHeight: 1.5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" },
  metric: { display: "grid", gap: "4px", padding: "10px", border: "1px solid color-mix(in srgb, currentColor 14%, transparent)", borderRadius: "8px" },
  metricLabel: { fontSize: "12px", opacity: 0.68 },
  metricValue: { overflowWrap: "anywhere" as const },
  actions: { display: "flex", flexWrap: "wrap" as const, gap: "8px" },
  notice: { margin: 0, fontSize: "12px", opacity: 0.8 },
} as const
