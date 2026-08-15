import SqliteDatabase from "better-sqlite3"
import type { JsonValue } from "../../../../../shared/types/json-value"
import type { KeyValueRecord } from "../../domain/entities/key-value-record"
import type { KeyValueRepository } from "../../domain/repositories/key-value-repository"

interface RecordRow {
	readonly key: string
	readonly value: string
	readonly created_at: string
	readonly updated_at: string
}

export class BetterSqliteRecordRepository implements KeyValueRepository {
	private readonly database: SqliteDatabase.Database

	public constructor(databasePath: string) {
		this.database = new SqliteDatabase(databasePath)
		this.database.pragma("journal_mode = WAL")
		this.database.exec(`
      CREATE TABLE IF NOT EXISTS records (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
	}

	public get(key: string): KeyValueRecord | null {
		const row = this.database
			.prepare("SELECT key, value, created_at, updated_at FROM records WHERE key = ?")
			.get(key) as RecordRow | undefined

		return row ? this.toRecord(row) : null
	}

	public set(key: string, value: JsonValue): KeyValueRecord {
		const timestamp = new Date().toISOString()
		this.database
			.prepare(
				`
          INSERT INTO records (key, value, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
			)
			.run(key, JSON.stringify(value), timestamp, timestamp)

		const record = this.get(key)
		if (!record) {
			throw new Error(`Failed to read the saved database record: ${key}`)
		}

		return record
	}

	public delete(key: string): boolean {
		const result = this.database.prepare("DELETE FROM records WHERE key = ?").run(key)

		return result.changes > 0
	}

	public list(): KeyValueRecord[] {
		const rows = this.database
			.prepare("SELECT key, value, created_at, updated_at FROM records ORDER BY key ASC")
			.all() as RecordRow[]

		return rows.map((row) => this.toRecord(row))
	}

	public close(): void {
		if (this.database.open) {
			this.database.close()
		}
	}

	private toRecord(row: RecordRow): KeyValueRecord {
		return {
			key: row.key,
			value: JSON.parse(row.value) as JsonValue,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}
	}
}
