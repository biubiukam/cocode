import { ipcRenderer } from "electron"
import { dshRuntimeChannels, type DshRuntimeApi } from "../../contracts/ipc/dsh-runtime.contract"

export const dshRuntimeBridge: DshRuntimeApi = {
	getBootstrap: () => ipcRenderer.invoke(dshRuntimeChannels.bootstrap),
	request: (request) => ipcRenderer.invoke(dshRuntimeChannels.request, request),
	cancelRequest: (requestId) => ipcRenderer.send(dshRuntimeChannels.cancelRequest, requestId),
}
