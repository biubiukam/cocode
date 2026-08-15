import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SessionId } from "../../../src/main/contexts/database/domain/value-objects/session-id"

describe("SessionId", () => {
	it("accepts an alphanumeric session id with dashes and underscores", () => {
		const sessionId = SessionId.create("session_01-demo")

		assert.equal(sessionId.value, "session_01-demo")
	})

	it("rejects values that could escape the sessions directory", () => {
		for (const value of ["", ".", "..", "../other", "nested/session", "session\\id"]) {
			assert.throws(() => SessionId.create(value), /session id/i)
		}
	})
})
