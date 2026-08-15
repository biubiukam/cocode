import { ipcRenderer } from "electron"
import {
	shortcutsChannels,
	type ShortcutsApi,
	type SyncShortcutsRequest,
} from "../../contracts/ipc/shortcuts.contract"
import {
	parseSyncShortcutsRequest,
	parseSyncShortcutsResult,
	parseTriggeredShortcutCommandId,
} from "../../contracts/schemas/shortcuts.schema"

export const shortcutsBridge: ShortcutsApi = {
	sync: async (request: SyncShortcutsRequest) => {
		const parsed = parseSyncShortcutsRequest(request)
		return parseSyncShortcutsResult(await ipcRenderer.invoke(shortcutsChannels.sync, parsed))
	},
	onTriggered: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
			try {
				listener(parseTriggeredShortcutCommandId(value))
			} catch {
				// Main is the only producer; malformed events are ignored at the bridge.
			}
		}
		ipcRenderer.on(shortcutsChannels.triggered, handler)
		return () => ipcRenderer.removeListener(shortcutsChannels.triggered, handler)
	},
}
