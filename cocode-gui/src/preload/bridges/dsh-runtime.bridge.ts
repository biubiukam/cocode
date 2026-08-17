import { ipcRenderer } from "electron"
import {
	dshRuntimeChannels,
	type DshRuntimeApi,
	type DshRuntimeReboundDto,
	type DshRuntimeRecoveryStateDto,
} from "../../contracts/ipc/dsh-runtime.contract"

export const dshRuntimeBridge: DshRuntimeApi = {
	getBootstrap: () => ipcRenderer.invoke(dshRuntimeChannels.bootstrap),
	request: (request) => ipcRenderer.invoke(dshRuntimeChannels.request, request),
	cancelRequest: (requestId) => ipcRenderer.send(dshRuntimeChannels.cancelRequest, requestId),
	requestRecovery: (request) => ipcRenderer.invoke(dshRuntimeChannels.requestRecovery, request),
	onRecoveryState: (listener) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			value: DshRuntimeRecoveryStateDto,
		): void => listener(value)
		ipcRenderer.on(dshRuntimeChannels.recoveryState, handler)
		return () => ipcRenderer.removeListener(dshRuntimeChannels.recoveryState, handler)
	},
	onRebound: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, value: DshRuntimeReboundDto): void =>
			listener(value)
		ipcRenderer.on(dshRuntimeChannels.rebound, handler)
		return () => ipcRenderer.removeListener(dshRuntimeChannels.rebound, handler)
	},
}
