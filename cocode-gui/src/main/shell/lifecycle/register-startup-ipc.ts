import { ipcMain, type WebContents } from "electron"
import { startupChannels } from "../../../contracts/ipc/startup.contract"

export interface StartupIpcOptions {
	readonly onRestart: () => boolean
	readonly onQuit: () => void
}

export function registerStartupIpc(options: StartupIpcOptions): void {
	ipcMain.handle(startupChannels.restart, (event) => {
		assertWindowSender(event.sender)
		return options.onRestart()
	})
	ipcMain.handle(startupChannels.quit, (event) => {
		assertWindowSender(event.sender)
		options.onQuit()
		return true
	})
}

export function unregisterStartupIpc(): void {
	ipcMain.removeHandler(startupChannels.restart)
	ipcMain.removeHandler(startupChannels.quit)
}

function assertWindowSender(sender: WebContents): void {
	if (sender.getType() !== "window") throw new Error("Startup IPC sender is not a window")
}
