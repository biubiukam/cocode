import { ipcRenderer } from "electron"
import type { DiagnosticsApi } from "../../contracts/ipc/diagnostics.contract"
import { diagnosticsChannels } from "../../contracts/ipc/diagnostics.contract"

export const diagnosticsBridge: DiagnosticsApi = {
	log: {
		writeBatch: (records) => {
			ipcRenderer.send(diagnosticsChannels.writeBatch, records)
		},
	},
	getStatus: () => ipcRenderer.invoke(diagnosticsChannels.getStatus),
	openLogFolder: () => ipcRenderer.invoke(diagnosticsChannels.openLogFolder),
	exportBundle: () => ipcRenderer.invoke(diagnosticsChannels.exportBundle),
	clearLogs: () => ipcRenderer.invoke(diagnosticsChannels.clearLogs),
	enableTemporaryDebug: (request) =>
		ipcRenderer.invoke(diagnosticsChannels.enableTemporaryDebug, request),
}
