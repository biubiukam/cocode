import type { JsonValue } from "../../shared/types/json-value"

export const databaseChannels = {
	get: "database:get",
	set: "database:set",
	delete: "database:delete",
	list: "database:list",
} as const

export type DatabaseScope =
	| { readonly kind: "global" }
	| { readonly kind: "session"; readonly sessionId: string }

export interface DatabaseRecordDto {
	readonly key: string
	readonly value: JsonValue
	readonly createdAt: string
	readonly updatedAt: string
}

export interface GetDatabaseRecordRequest {
	readonly scope: DatabaseScope
	readonly key: string
}

export interface SetDatabaseRecordRequest extends GetDatabaseRecordRequest {
	readonly value: JsonValue
}

export type DeleteDatabaseRecordRequest = GetDatabaseRecordRequest

export interface ListDatabaseRecordsRequest {
	readonly scope: DatabaseScope
}

export interface GlobalDatabaseApi {
	get(key: string): Promise<DatabaseRecordDto | null>
	set(key: string, value: JsonValue): Promise<DatabaseRecordDto>
	delete(key: string): Promise<boolean>
	list(): Promise<DatabaseRecordDto[]>
}

export interface SessionDatabaseApi {
	get(sessionId: string, key: string): Promise<DatabaseRecordDto | null>
	set(sessionId: string, key: string, value: JsonValue): Promise<DatabaseRecordDto>
	delete(sessionId: string, key: string): Promise<boolean>
	list(sessionId: string): Promise<DatabaseRecordDto[]>
}

export interface DatabaseApi {
	readonly global: GlobalDatabaseApi
	readonly session: SessionDatabaseApi
}
