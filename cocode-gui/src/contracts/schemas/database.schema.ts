import type {
	DatabaseScope,
	DeleteDatabaseRecordRequest,
	GetDatabaseRecordRequest,
	ListDatabaseRecordsRequest,
	SetDatabaseRecordRequest,
} from "../ipc/database.contract"
import type { JsonPrimitive, JsonValue } from "../../shared/types/json-value"

const MAX_KEY_LENGTH = 256

function parseObject(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`)
	}

	return value as Record<string, unknown>
}

function parseKey(value: unknown): string {
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_KEY_LENGTH) {
		throw new Error(`Database key must be between 1 and ${MAX_KEY_LENGTH} characters.`)
	}

	return value
}

function parseScope(value: unknown): DatabaseScope {
	const scope = parseObject(value, "Database scope")
	if (scope.kind === "global") {
		return { kind: "global" }
	}

	if (scope.kind === "session" && typeof scope.sessionId === "string") {
		return { kind: "session", sessionId: scope.sessionId }
	}

	throw new Error("Database scope must be global or contain a session id.")
}

function parseJsonValue(value: unknown, seen = new Set<object>()): JsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		return value as JsonPrimitive
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return value
	}

	if (Array.isArray(value)) {
		if (seen.has(value)) {
			throw new Error("Database value must not contain circular references.")
		}
		seen.add(value)
		const parsed = value.map((item) => parseJsonValue(item, seen))
		seen.delete(value)
		return parsed
	}

	if (typeof value === "object" && value !== null) {
		if (seen.has(value)) {
			throw new Error("Database value must not contain circular references.")
		}
		seen.add(value)
		const parsed: Record<string, JsonValue> = {}
		for (const [key, item] of Object.entries(value)) {
			if (item === undefined) {
				throw new Error("Database value must be JSON serializable.")
			}
			parsed[key] = parseJsonValue(item, seen)
		}
		seen.delete(value)
		return parsed
	}

	throw new Error("Database value must be JSON serializable.")
}

export function parseGetDatabaseRecordRequest(value: unknown): GetDatabaseRecordRequest {
	const request = parseObject(value, "Get database record request")
	return { scope: parseScope(request.scope), key: parseKey(request.key) }
}

export function parseSetDatabaseRecordRequest(value: unknown): SetDatabaseRecordRequest {
	const request = parseObject(value, "Set database record request")
	return {
		scope: parseScope(request.scope),
		key: parseKey(request.key),
		value: parseJsonValue(request.value),
	}
}

export function parseDeleteDatabaseRecordRequest(value: unknown): DeleteDatabaseRecordRequest {
	return parseGetDatabaseRecordRequest(value)
}

export function parseListDatabaseRecordsRequest(value: unknown): ListDatabaseRecordsRequest {
	const request = parseObject(value, "List database records request")
	return { scope: parseScope(request.scope) }
}
