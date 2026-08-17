import assert from "node:assert/strict"
import * as path from "pathe"
import { describe, it } from "node:test"
import { SessionId } from "../../../src/main/contexts/database/domain/value-objects/session-id"
import { DatabasePathResolver } from "../../../src/main/contexts/database/infrastructure/persistence/database-path-resolver"

describe("DatabasePathResolver", () => {
	it("places the global database under the .magic directory", () => {
		const resolver = new DatabasePathResolver("/Users/example")

		assert.equal(
			resolver.globalDatabasePath(),
			path.join("/Users/example", ".magic", "global.db"),
		)
	})

	it("places a session database under sessions/<sessionId>/user.db", () => {
		const resolver = new DatabasePathResolver("/Users/example")

		assert.equal(
			resolver.sessionDatabasePath(SessionId.create("session-001")),
			path.join("/Users/example", ".magic", "sessions", "session-001", "user.db"),
		)
	})
})
