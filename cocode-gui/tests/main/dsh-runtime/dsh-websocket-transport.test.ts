import assert from "node:assert/strict"
import test from "node:test"
import { registerDshWebSocketTransport } from "../../../src/main/shell/security/register-dsh-websocket-transport"

test("registers the new Runtime filters before removing the old filters", () => {
	const calls: Array<{ kind: string; filter: { urls?: string[] }; callback: unknown }> = []
	const session = {
		webRequest: {
			onBeforeSendHeaders(filter: { urls?: string[] }, callback: unknown) {
				calls.push({ kind: "before", filter, callback })
			},
			onHeadersReceived(filter: { urls?: string[] }, callback: unknown) {
				calls.push({ kind: "headers", filter, callback })
			},
		},
	}

	const controller = registerDshWebSocketTransport(
		session as never,
		"http://127.0.0.1:3100",
		"http://127.0.0.1:5173",
	)
	calls.length = 0
	controller.updateRuntimeOrigin("http://127.0.0.1:3200")

	assert.equal(calls[0]?.kind, "before")
	assert.match(calls[0]?.filter.urls?.[0] ?? "", /:3200\/api\/events\.mux/)
	assert.equal(calls[1]?.kind, "headers")
	assert.match(calls[1]?.filter.urls?.[0] ?? "", /:3200\/plugins\/events/)
	assert.equal(calls[2]?.kind, "before")
	assert.equal(calls[2]?.callback, null)
	assert.match(calls[2]?.filter.urls?.[0] ?? "", /:3100\/api\/events\.mux/)
	assert.equal(calls[3]?.kind, "headers")
	assert.equal(calls[3]?.callback, null)
	assert.match(calls[3]?.filter.urls?.[0] ?? "", /:3100\/plugins\/events/)

	controller.dispose()
})
