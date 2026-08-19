import { ipcMain, shell } from "electron"
import { localFilesChannels } from "../../../../../contracts/ipc/local-files.contract"
import { parseOpenLocalFileRequest } from "../../../../../contracts/schemas/local-files.schema"

export function registerLocalFilesIpc(): void {
	ipcMain.handle(localFilesChannels.open, async (event, value: unknown) => {
		if (event.sender.getType() !== "window")
			throw new Error("Local file IPC sender is not a window")
		const request = parseOpenLocalFileRequest(value)
		const error = await shell.openPath(request.path)
		if (error !== "") throw new Error(error)
	})
}

export function unregisterLocalFilesIpc(): void {
	ipcMain.removeHandler(localFilesChannels.open)
}
