import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"
import { afterEach, describe, it } from "node:test"
import { BetterSqliteDatabaseRepositoryProvider } from "../../../src/main/contexts/database/infrastructure/repositories/better-sqlite-database-repository-provider"
import { DatabasePathResolver } from "../../../src/main/contexts/database/infrastructure/persistence/database-path-resolver"

const temporaryDirectories: string[] = []

function createProvider(): {
	readonly homeDirectory: string
	readonly provider: BetterSqliteDatabaseRepositoryProvider
} {
	const homeDirectory = mkdtempSync(path.join(os.tmpdir(), "magic-home-"))
	temporaryDirectories.push(homeDirectory)

	return {
		homeDirectory,
		provider: new BetterSqliteDatabaseRepositoryProvider(
			new DatabasePathResolver(homeDirectory),
		),
	}
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true })
	}
})

describe("BetterSqliteDatabaseRepositoryProvider", () => {
	it("creates .magic/global.db when the global repository is initialized", () => {
		const { homeDirectory, provider } = createProvider()

		provider.getGlobalRepository()

		assert.equal(existsSync(path.join(homeDirectory, ".magic", "global.db")), true)
		provider.closeAll()
	})

	it("creates a user database lazily for each valid session", () => {
		const { homeDirectory, provider } = createProvider()

		provider.getSessionRepository("session-001").set("name", "first")

		assert.equal(
			existsSync(path.join(homeDirectory, ".magic", "sessions", "session-001", "user.db")),
			true,
		)
		assert.equal(provider.getSessionRepository("session-002").get("name"), null)
		provider.closeAll()
	})
})
