import { ipcRenderer } from "electron"
import {
	databaseChannels,
	type DatabaseApi,
	type DatabaseScope,
} from "../../contracts/ipc/database.contract"
import type { JsonValue } from "../../shared/types/json-value"

const globalScope: DatabaseScope = { kind: "global" }
const sessionScope = (sessionId: string): DatabaseScope => ({
	kind: "session",
	sessionId,
})

export const databaseBridge: DatabaseApi = {
	global: {
		get: (key) => ipcRenderer.invoke(databaseChannels.get, { scope: globalScope, key }),
		set: (key, value: JsonValue) =>
			ipcRenderer.invoke(databaseChannels.set, {
				scope: globalScope,
				key,
				value,
			}),
		delete: (key) => ipcRenderer.invoke(databaseChannels.delete, { scope: globalScope, key }),
		list: () => ipcRenderer.invoke(databaseChannels.list, { scope: globalScope }),
	},
	session: {
		get: (sessionId, key) =>
			ipcRenderer.invoke(databaseChannels.get, {
				scope: sessionScope(sessionId),
				key,
			}),
		set: (sessionId, key, value: JsonValue) =>
			ipcRenderer.invoke(databaseChannels.set, {
				scope: sessionScope(sessionId),
				key,
				value,
			}),
		delete: (sessionId, key) =>
			ipcRenderer.invoke(databaseChannels.delete, {
				scope: sessionScope(sessionId),
				key,
			}),
		list: (sessionId) =>
			ipcRenderer.invoke(databaseChannels.list, {
				scope: sessionScope(sessionId),
			}),
	},
}
