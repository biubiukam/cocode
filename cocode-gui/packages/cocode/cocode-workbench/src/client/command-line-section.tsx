import { useEffect, useState } from "react"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import type { TuiCommandLineToolStatus } from "../../../../../src/contracts/ipc/tui.contract.ts"

export function CommandLineSection(): JSX.Element {
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
      .then(() => setMessage(isChinese() ? "已打开终端。" : "Terminal opened."), (error: unknown) => setMessage(safeMessage(error)))
      .finally(() => setBusy(false))
  }

  const copyDiagnostics = (): void => {
    if (status === undefined || busy) return
    setBusy(true)
    setMessage(undefined)
    void navigator.clipboard.writeText(JSON.stringify(status, null, 2))
      .then(() => setMessage(isChinese() ? "CLI 诊断信息已复制。" : "CLI diagnostics copied."), (error: unknown) => setMessage(safeMessage(error)))
      .finally(() => setBusy(false))
  }

  if (api === undefined) {
    return <section style={styles.section}>
      <h2 style={styles.title}>{isChinese() ? "命令行工具" : "Command line"}</h2>
      <p>{isChinese() ? "桌面命令行桥不可用。" : "Desktop command-line bridge is unavailable."}</p>
    </section>
  }

  return <section style={styles.section}>
    <h2 style={styles.title}>{isChinese() ? "命令行工具" : "Command line"}</h2>
    <p style={styles.description}>{isChinese() ? "安装器会注册 Desktop CLI；Desktop 启动时还会幂等检查并修复。TUI 只会在你执行 cocode 或打开终端时启动。" : "The installer registers the Desktop CLI, and Desktop also checks and repairs it idempotently on startup. The TUI starts only when you run cocode or open a terminal."}</p>
    <div style={styles.grid}>
      <Metric label={isChinese() ? "状态" : "Status"} value={statusLabel(status)} />
      <Metric label={isChinese() ? "命令路径" : "Command path"} value={status?.path ?? "—"} />
      <Metric label={isChinese() ? "PATH 目录" : "PATH directory"} value={status === undefined ? "—" : status.directoryOnPath ? (isChinese() ? "已包含" : "Available") : (isChinese() ? "未检测到" : "Not detected")} />
      <Metric label={isChinese() ? "持久化 PATH" : "Persistent PATH"} value={status === undefined ? "—" : status.persistentPathConfigured ? (isChinese() ? "已注册" : "Registered") : (isChinese() ? "未注册" : "Not registered")} />
      <Metric label={isChinese() ? "注册来源" : "Registration"} value={registrationLabel(status)} />
      <Metric label={isChinese() ? "运行时" : "Runtime"} value={runtimeLabel(status)} />
    </div>
    {status?.detail !== undefined && <p style={styles.notice}>{status.detail}</p>}
    {status !== undefined && !status.directoryOnPath && <p style={styles.notice}>{isChinese() ? `请确认 ${status.directory} 已加入终端 PATH。` : `Make sure ${status.directory} is included in your terminal PATH.`}</p>}
    {status !== undefined && status.persistentPathConfigured && !status.directoryOnPath && <p style={styles.notice}>{isChinese() ? "PATH 已写入系统，但当前应用进程尚未刷新；请打开一个新终端。" : "The persistent PATH is configured, but this process has not refreshed it; open a new terminal."}</p>}
    <div style={styles.actions}>
      <button type="button" disabled={busy || status?.canRepair !== true} onClick={repair}>{isChinese() ? "修复命令行工具" : "Repair command line"}</button>
      <button type="button" disabled={busy} onClick={openInTerminal}>{isChinese() ? "在终端中打开 Cocode" : "Open Cocode in terminal"}</button>
      <button type="button" disabled={busy} onClick={refresh}>{isChinese() ? "刷新状态" : "Refresh status"}</button>
      <button type="button" disabled={busy || status === undefined} onClick={copyDiagnostics}>{isChinese() ? "复制诊断信息" : "Copy diagnostics"}</button>
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

function statusLabel(status: TuiCommandLineToolStatus | undefined): string {
  if (status === undefined) return "—"
  if (!isChinese()) return status.state
  return {
    installed: "已安装",
    missing: "未安装",
    stale: "需要更新",
    conflict: "存在命令冲突",
    unavailable: "暂不可用",
  }[status.state]
}

function statusMessage(status: TuiCommandLineToolStatus): string {
  if (status.state === "conflict") return isChinese() ? "检测到未由 Cocode 管理的 cocode 命令，未覆盖。" : "An unmanaged cocode command was found; it was not overwritten."
  return statusLabel(status)
}

function registrationLabel(status: TuiCommandLineToolStatus | undefined): string {
  if (status === undefined) return "—"
  if (!isChinese()) return status.registrationSource
  return {
    installer: "安装器",
    "desktop-startup": "Desktop 启动",
    manual: "手动修复",
    unknown: "未知",
  }[status.registrationSource]
}

function runtimeLabel(status: TuiCommandLineToolStatus | undefined): string {
  if (status === undefined) return "—"
  if (!status.runtimeValid) return isChinese() ? "不可用" : "Invalid"
  const version = status.tuiVersion ?? status.runtimeVersion
  return version === undefined ? (isChinese() ? "有效" : "Valid") : version
}

function successMessage(): string {
  return isChinese() ? "命令行工具已修复。" : "Command-line tool repaired."
}

function isChinese(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh")
}

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
