import { useEffect, useState, useSyncExternalStore } from "react"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import type {
  DiagnosticsLogRecordDto,
  DiagnosticsStatusDto,
} from "../../../../../src/contracts/ipc/diagnostics.contract.ts"
import { localeRevision, subscribeLocale, t } from "./locales.ts"

export function DiagnosticsSection(): JSX.Element {
  useSyncExternalStore(subscribeLocale, localeRevision, localeRevision)
  const api = getDesktopApi()?.diagnostics
  const [status, setStatus] = useState<DiagnosticsStatusDto | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [queryText, setQueryText] = useState("")
  const [records, setRecords] = useState<readonly DiagnosticsLogRecordDto[]>([])

  const refresh = (): void => {
    if (api === undefined) return
    void api.getStatus().then(setStatus, (error: unknown) => setMessage(safeMessage(error)))
    void api.queryLogs({ text: queryText.trim() || undefined, limit: 50 }).then((result) => setRecords(result.items), (error: unknown) => setMessage(safeMessage(error)))
  }

  useEffect(() => {
    if (api === undefined) return
    void api.getStatus().then(setStatus, (error: unknown) => setMessage(safeMessage(error)))
    void api.queryLogs({ limit: 50 }).then((result) => setRecords(result.items), (error: unknown) => setMessage(safeMessage(error)))
  }, [api])

  const run = (operation: () => Promise<void>, success: string): void => {
    if (busy) return
    setBusy(true)
    setMessage(undefined)
    void operation().then(() => setMessage(success), (error: unknown) => setMessage(safeMessage(error))).finally(() => {
      setBusy(false)
      refresh()
    })
  }

  if (api === undefined) {
    return <section style={styles.section}><h2 style={styles.title}>{t("diagnostics.title")}</h2><p>{t("diagnostics.unavailable")}</p></section>
  }

  return <section style={styles.section}>
    <h2 style={styles.title}>{t("diagnostics.title")}</h2>
    <p style={styles.description}>{t("diagnostics.description")}</p>
    <div style={styles.grid}>
      <Metric label={t("diagnostics.appLogs")} value={formatBytes(status?.appLogBytes ?? 0)} />
      <Metric label={t("diagnostics.auditLogs")} value={formatBytes(status?.auditLogBytes ?? 0)} />
      <Metric label={t("diagnostics.hostLogs")} value={formatBytes(status?.hostLogBytes ?? 0)} />
      <Metric label={t("diagnostics.tuiLogs")} value={formatBytes(status?.tuiLogBytes ?? 0)} />
      <Metric label={t("diagnostics.crashDumps")} value={String(status?.crashCount ?? 0)} />
      <Metric label={t("diagnostics.dropped")} value={String(status?.droppedRecordCount ?? 0)} />
      <Metric label={t("diagnostics.electronMemory")} value={formatBytes(status?.resources?.latest?.electronWorkingSetBytes ?? 0)} />
      <Metric label={t("diagnostics.electronProcesses")} value={String(status?.resources?.latest?.processCount ?? 0)} />
    </div>
    {status?.temporaryDebugUntil !== undefined && <p style={styles.notice}>{t("diagnostics.debugUntil", { time: status.temporaryDebugUntil })}</p>}
    <div style={styles.actions}>
      <button type="button" disabled={busy} onClick={() => run(api.openLogFolder, t("diagnostics.folderOpened"))}>{t("diagnostics.openFolder")}</button>
      <button type="button" disabled={busy} onClick={() => run(async () => { const result = await api.exportBundle(); if (!result.cancelled) setMessage(t("diagnostics.exported", { file: result.fileName ?? "diagnostics bundle" })) }, t("diagnostics.exportComplete"))}>{t("diagnostics.export")}</button>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm(t("diagnostics.clearConfirm"))) run(api.clearLogs, t("diagnostics.cleared")) }}>{t("diagnostics.clear")}</button>
      <button type="button" disabled={busy} onClick={() => run(async () => { await api.enableTemporaryDebug({ durationMinutes: 30 }) }, t("diagnostics.debugEnabled"))}>{t("diagnostics.enableDebug")}</button>
      <button type="button" disabled={busy} onClick={refresh}>{t("diagnostics.refresh")}</button>
    </div>
    <div style={styles.query}>
      <input
        value={queryText}
        placeholder={t("diagnostics.searchPlaceholder")}
        onChange={(event) => setQueryText(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === "Enter") refresh() }}
      />
      <button type="button" disabled={busy} onClick={refresh}>{t("diagnostics.query")}</button>
    </div>
    <div style={styles.records} aria-live="polite">
      {records.length === 0 ? <p style={styles.notice}>{t("diagnostics.noMatches")}</p> : records.map((record) => (
        <div key={`${record.eventId ?? record.timestamp}-${record.sequence ?? record.eventName}`} style={styles.record}>
          <code>{record.timestamp}</code>
          <strong>{record.severityText ?? "INFO"}</strong>
          <span>{record.source}</span>
          <span>{record.eventName}</span>
          {record.message !== undefined && <span style={styles.message}>{record.message}</span>}
        </div>
      ))}
    </div>
    {message !== undefined && <p role="status" style={styles.notice}>{message}</p>}
  </section>
}

function getDesktopApi(): DesktopApi | undefined {
  return (window as Window & { readonly desktopApi?: DesktopApi }).desktopApi
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return <div style={styles.metric}><span style={styles.metricLabel}>{label}</span><strong>{value}</strong></div>
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const styles = {
  section: { display: "grid", gap: "12px", maxWidth: "720px", padding: "8px 0" },
  title: { margin: 0, fontSize: "18px" },
  description: { margin: 0, opacity: 0.72, lineHeight: 1.5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" },
  metric: { display: "grid", gap: "4px", padding: "10px", border: "1px solid color-mix(in srgb, currentColor 14%, transparent)", borderRadius: "8px" },
  metricLabel: { fontSize: "12px", opacity: 0.68 },
  actions: { display: "flex", flexWrap: "wrap" as const, gap: "8px" },
  query: { display: "flex", gap: "8px" },
  records: { display: "grid", gap: "4px", maxHeight: "260px", overflow: "auto" as const, border: "1px solid color-mix(in srgb, currentColor 14%, transparent)", borderRadius: "8px", padding: "8px" },
  record: { display: "grid", gridTemplateColumns: "180px 56px 56px minmax(140px, 1fr) minmax(0, 2fr)", gap: "8px", fontSize: "12px", alignItems: "baseline" },
  message: { opacity: 0.72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  notice: { margin: 0, fontSize: "12px", opacity: 0.8 },
} as const
