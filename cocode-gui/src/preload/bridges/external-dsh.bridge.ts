import { ipcRenderer } from "electron"
import {
	sharedDshChannels,
	type SharedDshApi,
	type SharedDshChangeDto,
} from "../../contracts/ipc/external-dsh.contract"

export const sharedDshBridge: SharedDshApi = {
	status: () => ipcRenderer.invoke(sharedDshChannels.status),
	catalog: () => ipcRenderer.invoke(sharedDshChannels.catalog),
	sessionHistory: (request) => ipcRenderer.invoke(sharedDshChannels.sessionHistory, request),
	attachment: (request) => ipcRenderer.invoke(sharedDshChannels.attachment, request),
	conflictStatus: (request) => ipcRenderer.invoke(sharedDshChannels.conflictStatus, request),
	subscribe: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, value: SharedDshChangeDto): void =>
			listener(value)
		ipcRenderer.on(sharedDshChannels.change, handler)
		return () => ipcRenderer.removeListener(sharedDshChannels.change, handler)
	},
}

/** @deprecated Use sharedDshBridge. */
export const externalDshBridge = sharedDshBridge
