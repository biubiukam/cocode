import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
	parseDshRuntimeRequest,
	parseDshRuntimeRequestId,
} from "../../../src/contracts/schemas/dsh-runtime.schema"

describe("DSH runtime IPC schemas", () => {
	it("accepts an allow-listed API request", () => {
		const request = parseDshRuntimeRequest({
			requestId: "00000000-0000-4000-8000-000000000001",
			path: "/api/session.list",
			method: "POST",
			headers: [["content-type", "application/json"]],
			body: new Uint8Array([123, 125]),
		})

		assert.equal(request.path, "/api/session.list")
		assert.deepEqual(request.headers, [["content-type", "application/json"]])
	})

	it("accepts an allow-listed sidebar request", () => {
		const request = parseDshRuntimeRequest({
			requestId: "00000000-0000-4000-8000-000000000002",
			path: "/sidebar/api/fs.tree",
			method: "POST",
			headers: [["content-type", "application/json"]],
			body: new Uint8Array([123, 125]),
		})

		assert.equal(request.path, "/sidebar/api/fs.tree")
	})

	it("rejects non-allow-listed paths and malformed cancellation ids", () => {
		assert.throws(() =>
			parseDshRuntimeRequest({
				requestId: "00000000-0000-4000-8000-000000000001",
				path: "/etc/passwd",
				method: "GET",
				headers: [],
			}),
		)
		assert.throws(() =>
			parseDshRuntimeRequest({
				requestId: "00000000-0000-4000-8000-000000000001",
				path: "/sidebarish/api",
				method: "GET",
				headers: [],
			}),
		)
		assert.throws(() => parseDshRuntimeRequestId("not-a-uuid"))
	})
})
