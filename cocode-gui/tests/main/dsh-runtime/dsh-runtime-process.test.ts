import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fetchDshRuntimeRequest } from "../../../src/main/contexts/dsh-runtime/infrastructure/dsh-runtime-request"

describe("DSH Runtime request recovery", () => {
	it("starts recovery after a failed POST without replaying the uncertain mutation", async () => {
		let recoveryRequests = 0
		let fetchCount = 0

		await assert.rejects(
			() =>
				fetchDshRuntimeRequest({
					target: new URL("http://127.0.0.1:43127/api/rpc"),
					method: "POST",
					headers: new Headers(),
					body: new Uint8Array(),
					signal: new AbortController().signal,
					onTransportFailure: () => {
						recoveryRequests += 1
					},
					fetchImpl: async () => {
						fetchCount += 1
						throw new TypeError("fetch failed")
					},
				}),
			/OUTCOME_UNKNOWN: DSH runtime did not confirm whether the mutation was accepted \(fetch failed\)\./,
		)

		assert.equal(fetchCount, 1)
		assert.equal(recoveryRequests, 1)
	})

	it("starts recovery after a failed GET while preserving the transport error", async () => {
		let recoveryRequests = 0
		const transportError = new TypeError("fetch failed")

		await assert.rejects(
			() =>
				fetchDshRuntimeRequest({
					target: new URL("http://127.0.0.1:43127/api/host.describe"),
					method: "GET",
					headers: new Headers(),
					body: undefined,
					signal: new AbortController().signal,
					onTransportFailure: () => {
						recoveryRequests += 1
					},
					fetchImpl: async () => {
						throw transportError
					},
				}),
			(error) => error === transportError,
		)

		assert.equal(recoveryRequests, 1)
	})

	it("does not recover or relabel a request cancelled by its caller", async () => {
		let recoveryRequests = 0
		const controller = new AbortController()
		const abortError = new DOMException("This operation was aborted", "AbortError")

		await assert.rejects(
			() =>
				fetchDshRuntimeRequest({
					target: new URL("http://127.0.0.1:43127/api/rpc"),
					method: "POST",
					headers: new Headers(),
					body: new Uint8Array(),
					signal: controller.signal,
					onTransportFailure: () => {
						recoveryRequests += 1
					},
					fetchImpl: async () => {
						controller.abort()
						throw abortError
					},
				}),
			(error) => error === abortError,
		)

		assert.equal(recoveryRequests, 0)
	})
})
