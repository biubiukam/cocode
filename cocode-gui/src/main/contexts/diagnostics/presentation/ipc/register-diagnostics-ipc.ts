import { ipcMain, type WebContents } from "electron"
import { diagnosticsChannels } from "../../../../../contracts/ipc/diagnostics.contract"
import {
	parseRendererLogBatch,
	parseTemporaryDebugRequest,
} from "../../../../../contracts/schemas/diagnostics.schema"
import type { DiagnosticsService } from "../../../../shared/observability/diagnostics-service"
import type { DesktopLogger } from "../../../../shared/logging/desktop-logger"

export function registerDiagnosticsIpc(
	diagnostics: DiagnosticsService,
	logger: DesktopLogger,
): void {
	ipcMain.on(diagnosticsChannels.writeBatch, (event, value: unknown) => {
		try {
			diagnosticsLogger(logger, event.sender, value)
		} catch (error) {
			logger.log("warn", "diagnostics.renderer-batch-rejected", { error })
		}
	})
	ipcMain.handle(diagnosticsChannels.getStatus, () => diagnostics.getStatus())
	ipcMain.handle(diagnosticsChannels.openLogFolder, () => diagnostics.openLogFolder())
	ipcMain.handle(diagnosticsChannels.exportBundle, () => diagnostics.exportBundle())
	ipcMain.handle(diagnosticsChannels.clearLogs, () => diagnostics.clearLogs())
	ipcMain.handle(diagnosticsChannels.enableTemporaryDebug, (_event, value: unknown) => {
		return diagnostics.enableTemporaryDebug(parseTemporaryDebugRequest(value))
	})
}

export function unregisterDiagnosticsIpc(): void {
	ipcMain.removeAllListeners(diagnosticsChannels.writeBatch)
	for (const channel of [
		diagnosticsChannels.getStatus,
		diagnosticsChannels.openLogFolder,
		diagnosticsChannels.exportBundle,
		diagnosticsChannels.clearLogs,
		diagnosticsChannels.enableTemporaryDebug,
	])
		ipcMain.removeHandler(channel)
}

function diagnosticsLogger(logger: DesktopLogger, sender: WebContents, value: unknown): void {
	if (sender.getType() !== "window") throw new Error("diagnostics IPC sender is not a window")
	const records = parseRendererLogBatch(value)
	logger.recordRendererBatch(records, sender.id)
}
