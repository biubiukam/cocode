import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DatabaseService } from "../../../src/main/contexts/database/application/use-cases/database-service"
import type { DatabaseRepositoryProvider } from "../../../src/main/contexts/database/application/ports/database-repository-provider"
import type { KeyValueRecord } from "../../../src/main/contexts/database/domain/entities/key-value-record"
import type { KeyValueRepository } from "../../../src/main/contexts/database/domain/repositories/key-value-repository"
import type { JsonValue } from "../../../src/shared/types/json-value"

class MemoryRepository implements KeyValueRepository {
	private readonly records = new Map<string, KeyValueRecord>()

	public get(key: string): KeyValueRecord | null {
		return this.records.get(key) ?? null
	}

	public set(key: string, value: JsonValue): KeyValueRecord {
		const existing = this.records.get(key)
		const timestamp = new Date().toISOString()
		const record = {
			key,
			value,
			createdAt: existing?.createdAt ?? timestamp,
			updatedAt: timestamp,
		} satisfies KeyValueRecord
		this.records.set(key, record)
		return record
	}

	public delete(key: string): boolean {
		return this.records.delete(key)
	}

	public list(): KeyValueRecord[] {
		return [...this.records.values()]
	}
}

class MemoryProvider implements DatabaseRepositoryProvider {
	public readonly global = new MemoryRepository()
	public readonly sessions = new Map<string, MemoryRepository>()

	public getGlobalRepository(): KeyValueRepository {
		return this.global
	}

	public getSessionRepository(sessionId: string): KeyValueRepository {
		const repository = this.sessions.get(sessionId) ?? new MemoryRepository()
		this.sessions.set(sessionId, repository)
		return repository
	}
}

describe("DatabaseService", () => {
	it("keeps global and session records isolated", () => {
		const provider = new MemoryProvider()
		const service = new DatabaseService(provider)

		service.set({ scope: { kind: "global" }, key: "theme", value: "dark" })
		service.set({
			scope: { kind: "session", sessionId: "session-1" },
			key: "theme",
			value: "light",
		})

		assert.equal(service.get({ scope: { kind: "global" }, key: "theme" })?.value, "dark")
		assert.equal(
			service.get({
				scope: { kind: "session", sessionId: "session-1" },
				key: "theme",
			})?.value,
			"light",
		)
	})

	it("supports list and delete through the selected scope", () => {
		const service = new DatabaseService(new MemoryProvider())
		const scope = { kind: "global" } as const
		service.set({ scope, key: "one", value: 1 })
		service.set({ scope, key: "two", value: 2 })

		assert.equal(service.list({ scope }).length, 2)
		assert.equal(service.delete({ scope, key: "one" }), true)
		assert.equal(service.get({ scope, key: "one" }), null)
	})
})
