import { BrowserWindow, ipcMain, type WebContents } from "electron"
import { dshRuntimeChannels } from "../../../../../contracts/ipc/dsh-runtime.contract"
import {
	parseDshRuntimeRecoveryRequest,
	parseDshRuntimeRequest,
	parseDshRuntimeRequestId,
} from "../../../../../contracts/schemas/dsh-runtime.schema"
import type { DshRuntimeProcess } from "../../infrastructure/dsh-runtime-process"
import type { DesktopLogger } from "../../../../shared/logging/desktop-logger"

interface SenderRequestState {
	readonly sender: WebContents
	readonly requests: Map<string, AbortController>
	readonly onDestroyed: () => void
}

const senderStates = new Map<number, SenderRequestState>()
let disposeRecoveryState: (() => void) | undefined
let disposeRebound: (() => void) | undefined

export interface DshRuntimeIpcOptions {
	readonly onRebound?: (origin: string) => void
}

export function registerDshRuntimeIpc(
	runtime: DshRuntimeProcess,
	logger?: DesktopLogger,
	options: DshRuntimeIpcOptions = {},
): void {
	disposeRecoveryState = runtime.onRecoveryState((state) => {
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed())
				window.webContents.send(dshRuntimeChannels.recoveryState, state)
		}
	})
	disposeRebound = runtime.onRebound((event) => {
		options.onRebound?.(event.bootstrap.origin)
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed()) window.webContents.send(dshRuntimeChannels.rebound, event)
		}
	})
	ipcMain.handle(dshRuntimeChannels.bootstrap, () => {
		const started = Date.now()
		return runtime.getBootstrap().then(
			(value) => {
				logger?.log("debug", "dsh.bootstrap", {
					outcome: "success",
					durationMs: Date.now() - started,
				})
				return value
			},
			(error: unknown) => {
				logger?.log("error", "dsh.bootstrap", {
					outcome: "failure",
					durationMs: Date.now() - started,
					error,
				})
				throw error
			},
		)
	})
	ipcMain.handle(dshRuntimeChannels.request, async (event, value: unknown) => {
		const started = Date.now()
		const request = parseDshRuntimeRequest(value)
		const state = getSenderState(event.sender)
		if (state.requests.has(request.requestId)) {
			throw new Error(`DSH runtime request ${request.requestId} is already active.`)
		}

		const controller = new AbortController()
		state.requests.set(request.requestId, controller)
		try {
			const response = await runtime.request(request, controller.signal)
			logger?.log("debug", "dsh.http.request", {
				outcome: "success",
				durationMs: Date.now() - started,
				attributes: {
					method: request.method,
					path: pathTemplate(request.path),
					status: response.status,
					bytes: response.body.byteLength,
					senderId: event.sender.id,
				},
			})
			return response
		} catch (error) {
			logger?.log("error", "dsh.http.request", {
				outcome: controller.signal.aborted ? "cancelled" : "failure",
				durationMs: Date.now() - started,
				error,
				attributes: {
					method: request.method,
					path: pathTemplate(request.path),
					senderId: event.sender.id,
				},
			})
			throw error
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
	ipcMain.handle(dshRuntimeChannels.requestRecovery, async (event, value: unknown) => {
		if (event.sender.isDestroyed()) throw new Error("DSH runtime recovery sender is destroyed.")
		const request = parseDshRuntimeRecoveryRequest(value)
		logger?.log("info", "dsh.runtime.recovery.requested", {
			attributes: {
				reason: request.reason,
				endpointGeneration: request.endpointGeneration,
				senderId: event.sender.id,
			},
		})
		return runtime.recover(request.reason, request.endpointGeneration)
	})
	ipcMain.on(dshRuntimeChannels.cancelRequest, (event, value: unknown) => {
		let requestId: string
		try {
			requestId = parseDshRuntimeRequestId(value)
		} catch {
			logger?.log("warn", "dsh.http.cancel.rejected", {
				attributes: { senderId: event.sender.id },
			})
			return
		}
		const controller = senderStates.get(event.sender.id)?.requests.get(requestId)
		if (controller === undefined) {
			logger?.log("warn", "dsh.http.cancel.unknown", {
				attributes: { senderId: event.sender.id },
			})
			return
		}
		controller.abort()
		logger?.log("debug", "dsh.http.cancelled", {
			outcome: "cancelled",
			attributes: { senderId: event.sender.id },
		})
	})
}

function pathTemplate(value: string): string {
	const withoutQuery = value.split("?", 1)[0]?.split("#", 1)[0]
	return withoutQuery === undefined || withoutQuery === "" ? "/" : withoutQuery.slice(0, 256)
}

export function unregisterDshRuntimeIpc(): void {
	disposeRecoveryState?.()
	disposeRecoveryState = undefined
	disposeRebound?.()
	disposeRebound = undefined
	ipcMain.removeHandler(dshRuntimeChannels.bootstrap)
	ipcMain.removeHandler(dshRuntimeChannels.request)
	ipcMain.removeHandler(dshRuntimeChannels.requestRecovery)
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
