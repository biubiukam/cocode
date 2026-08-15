import { ipcMain } from "electron"
import { databaseChannels } from "../../../../../contracts/ipc/database.contract"
import {
	parseDeleteDatabaseRecordRequest,
	parseGetDatabaseRecordRequest,
	parseListDatabaseRecordsRequest,
	parseSetDatabaseRecordRequest,
} from "../../../../../contracts/schemas/database.schema"
import type { DatabaseService } from "../../application/use-cases/database-service"

export function registerDatabaseIpc(databaseService: DatabaseService): void {
	ipcMain.handle(databaseChannels.get, (_event, request: unknown) =>
		databaseService.get(parseGetDatabaseRecordRequest(request)),
	)
	ipcMain.handle(databaseChannels.set, (_event, request: unknown) =>
		databaseService.set(parseSetDatabaseRecordRequest(request)),
	)
	ipcMain.handle(databaseChannels.delete, (_event, request: unknown) =>
		databaseService.delete(parseDeleteDatabaseRecordRequest(request)),
	)
	ipcMain.handle(databaseChannels.list, (_event, request: unknown) =>
		databaseService.list(parseListDatabaseRecordsRequest(request)),
	)
}

export function unregisterDatabaseIpc(): void {
	for (const channel of Object.values(databaseChannels)) {
		ipcMain.removeHandler(channel)
	}
}
