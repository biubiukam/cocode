import { ipcMain } from "electron"
import { shortcutsChannels } from "../../../../../contracts/ipc/shortcuts.contract"
import { parseSyncShortcutsRequest } from "../../../../../contracts/schemas/shortcuts.schema"
import type { ShortcutService } from "../../application/shortcut-service"
import type { DesktopLogger } from "../../../../shared/logging/desktop-logger"

export function registerShortcutsIpc(service: ShortcutService, logger?: DesktopLogger): void {
	ipcMain.handle(shortcutsChannels.sync, (event, value: unknown) => {
		const started = Date.now()
		const request = parseSyncShortcutsRequest(value)
		try {
			const result = service.sync(request.bindings, event.sender)
			logger?.log("debug", "shortcuts.sync", {
				outcome: result.ok ? "success" : "degraded",
				durationMs: Date.now() - started,
				attributes: {
					bindingCount: request.bindings.length,
					conflictCount: result.conflicts?.length ?? 0,
				},
			})
			return result
		} catch (error) {
			logger?.log("error", "shortcuts.sync", {
				outcome: "failure",
				durationMs: Date.now() - started,
				error,
			})
			throw error
		}
	})
}

export function unregisterShortcutsIpc(): void {
	ipcMain.removeHandler(shortcutsChannels.sync)
}
