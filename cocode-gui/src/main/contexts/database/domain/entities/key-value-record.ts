import type { JsonValue } from "../../../../../shared/types/json-value"

export interface KeyValueRecord {
	readonly key: string
	readonly value: JsonValue
	readonly createdAt: string
	readonly updatedAt: string
}
