import { ipcRenderer } from "electron"
import { localFilesChannels, type LocalFilesApi } from "../../contracts/ipc/local-files.contract"

export const localFilesBridge: LocalFilesApi = {
	open: (request) => ipcRenderer.invoke(localFilesChannels.open, request) as Promise<void>,
}
