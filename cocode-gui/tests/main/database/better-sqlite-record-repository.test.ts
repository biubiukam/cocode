import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it } from "node:test"
import { BetterSqliteRecordRepository } from "../../../src/main/contexts/database/infrastructure/repositories/better-sqlite-record-repository"

const temporaryDirectories: string[] = []

function createRepository(): BetterSqliteRecordRepository {
	const directory = mkdtempSync(path.join(os.tmpdir(), "magic-database-"))
	temporaryDirectories.push(directory)

	return new BetterSqliteRecordRepository(path.join(directory, "test.db"))
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true })
	}
})

describe("BetterSqliteRecordRepository", () => {
	it("creates and reads a JSON record", () => {
		const repository = createRepository()

		const saved = repository.set("theme", { mode: "dark" })
		const found = repository.get("theme")

		assert.deepEqual(found, saved)
		assert.equal(saved.key, "theme")
		assert.deepEqual(saved.value, { mode: "dark" })
		repository.close()
	})

	it("updates an existing key while preserving its creation time", () => {
		const repository = createRepository()

		const created = repository.set("theme", "light")
		const updated = repository.set("theme", "dark")

		assert.equal(updated.createdAt, created.createdAt)
		assert.equal(updated.value, "dark")
		assert.equal(repository.list().length, 1)
		repository.close()
	})

	it("lists records ordered by key", () => {
		const repository = createRepository()
		repository.set("z-key", true)
		repository.set("a-key", 1)

		assert.deepEqual(
			repository.list().map((record) => record.key),
			["a-key", "z-key"],
		)
		repository.close()
	})

	it("deletes an existing record and reports missing records", () => {
		const repository = createRepository()
		repository.set("theme", "dark")

		assert.equal(repository.delete("theme"), true)
		assert.equal(repository.delete("theme"), false)
		assert.equal(repository.get("theme"), null)
		repository.close()
	})
})
