import { ipcMain } from "electron"
import { databaseChannels } from "../../../../../contracts/ipc/database.contract"
import {
	parseDeleteDatabaseRecordRequest,
	parseGetDatabaseRecordRequest,
	parseListDatabaseRecordsRequest,
	parseSetDatabaseRecordRequest,
} from "../../../../../contracts/schemas/database.schema"
import type { DatabaseService } from "../../application/use-cases/database-service"
import type { DesktopLogger } from "../../../../shared/logging/desktop-logger"

export function registerDatabaseIpc(
	databaseService: DatabaseService,
	logger?: DesktopLogger,
): void {
	ipcMain.handle(databaseChannels.get, (_event, request: unknown) =>
		invoke(logger, "database.get", () =>
			databaseService.get(parseGetDatabaseRecordRequest(request)),
		),
	)
	ipcMain.handle(databaseChannels.set, (_event, request: unknown) =>
		invoke(logger, "database.set", () =>
			databaseService.set(parseSetDatabaseRecordRequest(request)),
		),
	)
	ipcMain.handle(databaseChannels.delete, (_event, request: unknown) =>
		invoke(logger, "database.delete", () =>
			databaseService.delete(parseDeleteDatabaseRecordRequest(request)),
		),
	)
	ipcMain.handle(databaseChannels.list, (_event, request: unknown) =>
		invoke(logger, "database.list", () =>
			databaseService.list(parseListDatabaseRecordsRequest(request)),
		),
	)
}

export function unregisterDatabaseIpc(): void {
	for (const channel of Object.values(databaseChannels)) {
		ipcMain.removeHandler(channel)
	}
}

function invoke<T>(logger: DesktopLogger | undefined, eventName: string, operation: () => T): T {
	const started = Date.now()
	try {
		const result = operation()
		logger?.log("debug", eventName, {
			outcome: "success",
			durationMs: Date.now() - started,
			attributes: { process: "main" },
		})
		return result
	} catch (error) {
		logger?.log("error", eventName, {
			outcome: "failure",
			durationMs: Date.now() - started,
			error,
		})
		throw error
	}
}
