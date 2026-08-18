import { app, ipcMain } from "electron"
import { tuiChannels } from "../../../../../contracts/ipc/tui.contract"
import type { TuiLauncher } from "../../infrastructure/tui-launcher"
import type { DesktopLogger } from "../../../../shared/logging/desktop-logger"

export function registerTuiIpc(launcher: TuiLauncher, logger?: DesktopLogger): void {
	ipcMain.handle(tuiChannels.getCommandLineToolStatus, async () => {
		const status = await launcher.getCommandLineToolStatus()
		return { ...status, appVersion: app.getVersion() }
	})
	ipcMain.handle(tuiChannels.repairCommandLineTool, async () => {
		const result = await launcher.repairCommandLineTool()
		logger?.log(result.changed ? "info" : "warn", "tui.cli.repaired", {
			attributes: {
				state: result.status.state,
				path: result.status.path,
				changed: result.changed,
			},
		})
		return result
	})
	ipcMain.handle(tuiChannels.openInTerminal, async () => {
		await launcher.openInTerminal()
		logger?.log("info", "tui.terminal.opened")
	})
}

export function unregisterTuiIpc(): void {
	ipcMain.removeHandler(tuiChannels.getCommandLineToolStatus)
	ipcMain.removeHandler(tuiChannels.repairCommandLineTool)
	ipcMain.removeHandler(tuiChannels.openInTerminal)
}
