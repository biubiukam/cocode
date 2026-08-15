import { ipcMain, type WebContents } from "electron"
import { dshRuntimeChannels } from "../../../../../contracts/ipc/dsh-runtime.contract"
import {
	parseDshRuntimeRequest,
	parseDshRuntimeRequestId,
} from "../../../../../contracts/schemas/dsh-runtime.schema"
import type { DshRuntimeProcess } from "../../infrastructure/dsh-runtime-process"

interface SenderRequestState {
	readonly sender: WebContents
	readonly requests: Map<string, AbortController>
	readonly onDestroyed: () => void
}

const senderStates = new Map<number, SenderRequestState>()

export function registerDshRuntimeIpc(runtime: DshRuntimeProcess): void {
	ipcMain.handle(dshRuntimeChannels.bootstrap, () => runtime.getBootstrap())
	ipcMain.handle(dshRuntimeChannels.request, async (event, value: unknown) => {
		const request = parseDshRuntimeRequest(value)
		const state = getSenderState(event.sender)
		if (state.requests.has(request.requestId)) {
			throw new Error(`DSH runtime request ${request.requestId} is already active.`)
		}

		const controller = new AbortController()
		state.requests.set(request.requestId, controller)
		try {
			return await runtime.request(request, controller.signal)
		} finally {
			if (state.requests.get(request.requestId) === controller) {
				state.requests.delete(request.requestId)
			}
			if (state.requests.size === 0) {
				event.sender.removeListener("destroyed", state.onDestroyed)
				senderStates.delete(event.sender.id)
			}
		}
	})
	ipcMain.on(dshRuntimeChannels.cancelRequest, (event, value: unknown) => {
		let requestId: string
		try {
			requestId = parseDshRuntimeRequestId(value)
		} catch {
			return
		}
		senderStates.get(event.sender.id)?.requests.get(requestId)?.abort()
	})
}

export function unregisterDshRuntimeIpc(): void {
	ipcMain.removeHandler(dshRuntimeChannels.bootstrap)
	ipcMain.removeHandler(dshRuntimeChannels.request)
	ipcMain.removeAllListeners(dshRuntimeChannels.cancelRequest)
	for (const state of senderStates.values()) {
		state.sender.removeListener("destroyed", state.onDestroyed)
		for (const controller of state.requests.values()) controller.abort()
	}
	senderStates.clear()
}

function getSenderState(sender: WebContents): SenderRequestState {
	const existing = senderStates.get(sender.id)
	if (existing !== undefined) return existing

	const state: SenderRequestState = {
		sender,
		requests: new Map(),
		onDestroyed: () => {
			for (const controller of state.requests.values()) controller.abort()
			senderStates.delete(sender.id)
		},
	}
	sender.once("destroyed", state.onDestroyed)
	senderStates.set(sender.id, state)
	return state
}
