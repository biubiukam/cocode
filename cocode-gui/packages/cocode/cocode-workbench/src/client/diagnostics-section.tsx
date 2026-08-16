import { useEffect, useState } from "react"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import type { DiagnosticsStatusDto } from "../../../../../src/contracts/ipc/diagnostics.contract.ts"

export function DiagnosticsSection(): JSX.Element {
  const api = getDesktopApi()?.diagnostics
  const [status, setStatus] = useState<DiagnosticsStatusDto | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  const refresh = (): void => {
    if (api === undefined) return
    void api.getStatus().then(setStatus, (error: unknown) => setMessage(safeMessage(error)))
  }

  useEffect(() => {
    if (api === undefined) return
    void api.getStatus().then(setStatus, (error: unknown) => setMessage(safeMessage(error)))
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
    return <section style={styles.section}><h2 style={styles.title}>{isChinese() ? "诊断" : "Diagnostics"}</h2><p>{isChinese() ? "桌面诊断桥不可用。" : "Desktop diagnostics bridge is unavailable."}</p></section>
  }

  return <section style={styles.section}>
    <h2 style={styles.title}>{isChinese() ? "诊断" : "Diagnostics"}</h2>
    <p style={styles.description}>{isChinese() ? "日志只保存在本机，默认不包含 Prompt、模型正文、工具参数或凭据。" : "Logs stay on this device and exclude prompts, model content, tool arguments, and credentials by default."}</p>
    <div style={styles.grid}>
      <Metric label={isChinese() ? "应用日志" : "App logs"} value={formatBytes(status?.appLogBytes ?? 0)} />
      <Metric label={isChinese() ? "Host 日志" : "Host logs"} value={formatBytes(status?.hostLogBytes ?? 0)} />
      <Metric label={isChinese() ? "崩溃文件" : "Crash dumps"} value={String(status?.crashCount ?? 0)} />
      <Metric label={isChinese() ? "丢弃记录" : "Dropped records"} value={String(status?.droppedRecordCount ?? 0)} />
    </div>
    {status?.temporaryDebugUntil !== undefined && <p style={styles.notice}>{isChinese() ? `Debug 日志开启至 ${status.temporaryDebugUntil}` : `Debug logging enabled until ${status.temporaryDebugUntil}`}</p>}
    <div style={styles.actions}>
      <button type="button" disabled={busy} onClick={() => run(api.openLogFolder, isChinese() ? "已打开日志目录。" : "Log folder opened.")}>{isChinese() ? "打开日志目录" : "Open log folder"}</button>
      <button type="button" disabled={busy} onClick={() => run(async () => { const result = await api.exportBundle(); if (!result.cancelled) setMessage(isChinese() ? `已导出 ${result.fileName ?? "诊断包"}。` : `Exported ${result.fileName ?? "diagnostics bundle"}.`) }, isChinese() ? "导出已完成。" : "Export completed.")}>{isChinese() ? "导出诊断包" : "Export diagnostics"}</button>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm(isChinese() ? "清理本地日志？" : "Clear local logs?")) run(api.clearLogs, isChinese() ? "日志已清理。" : "Logs cleared.") }}>{isChinese() ? "清理日志" : "Clear logs"}</button>
      <button type="button" disabled={busy} onClick={() => run(async () => { await api.enableTemporaryDebug({ durationMinutes: 30 }) }, isChinese() ? "Debug 日志已临时开启 30 分钟。" : "Debug logging enabled for 30 minutes.")}>{isChinese() ? "开启 Debug（30 分钟）" : "Enable Debug (30 min)"}</button>
      <button type="button" disabled={busy} onClick={refresh}>{isChinese() ? "刷新状态" : "Refresh status"}</button>
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

function isChinese(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh")
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
  notice: { margin: 0, fontSize: "12px", opacity: 0.8 },
} as const
