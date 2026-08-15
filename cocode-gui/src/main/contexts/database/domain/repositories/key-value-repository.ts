import type { JsonValue } from "../../../../../shared/types/json-value"
import type { KeyValueRecord } from "../entities/key-value-record"

export interface KeyValueRepository {
	get(key: string): KeyValueRecord | null
	set(key: string, value: JsonValue): KeyValueRecord
	delete(key: string): boolean
	list(): KeyValueRecord[]
}
