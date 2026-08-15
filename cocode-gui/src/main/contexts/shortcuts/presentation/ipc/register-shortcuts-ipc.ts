import { ipcMain } from "electron"
import { shortcutsChannels } from "../../../../../contracts/ipc/shortcuts.contract"
import { parseSyncShortcutsRequest } from "../../../../../contracts/schemas/shortcuts.schema"
import type { ShortcutService } from "../../application/shortcut-service"

export function registerShortcutsIpc(service: ShortcutService): void {
	ipcMain.handle(shortcutsChannels.sync, (event, value: unknown) => {
		const request = parseSyncShortcutsRequest(value)
		return service.sync(request.bindings, event.sender)
	})
}

export function unregisterShortcutsIpc(): void {
	ipcMain.removeHandler(shortcutsChannels.sync)
}
