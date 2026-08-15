import assert from "node:assert/strict"
import test from "node:test"
import {
	rewriteDshHttpUrl,
	rewriteDshWebSocketUrl,
	rewriteEventSourceUrl,
} from "../../src/renderer/app/bootstrap/dsh-transport"

test("rewrites sidebar HTTP routes through the sidecar request bridge", () => {
	assert.equal(
		rewriteDshHttpUrl(
			"/sidebar/api/fs.tree",
			"http://localhost:5173",
			"http://localhost:5173/index.html",
			"http://127.0.0.1:43127",
		),
		"http://127.0.0.1:43127/sidebar/api/fs.tree",
	)
	assert.equal(
		rewriteDshHttpUrl(
			"http://127.0.0.1:43127/sidebar/file?id=1",
			"http://localhost:5173",
			"http://localhost:5173/index.html",
			"http://127.0.0.1:43127",
		),
		"http://127.0.0.1:43127/sidebar/file?id=1",
	)
	assert.equal(
		rewriteDshHttpUrl(
			"https://example.com/sidebar/file",
			"http://localhost:5173",
			"http://localhost:5173/index.html",
			"http://127.0.0.1:43127",
		),
		undefined,
	)
})

test("rewrites Cocode shortcut settings routes through the sidecar request bridge", () => {
	assert.equal(
		rewriteDshHttpUrl(
			"http://localhost:5173/cocode/shortcuts/api/settings.get",
			"http://localhost:5173",
			"http://localhost:5173/",
			"http://127.0.0.1:3080",
		),
		"http://127.0.0.1:3080/cocode/shortcuts/api/settings.get",
	)
})

test("rewrites sidebar WebSockets to the DSH sidecar", () => {
	assert.equal(
		rewriteDshWebSocketUrl(
			"/sidebar/ws/terminal?sessionId=s1",
			"http://localhost:5173",
			"http://localhost:5173/index.html",
			"http://127.0.0.1:43127",
		),
		"ws://127.0.0.1:43127/sidebar/ws/terminal?sessionId=s1",
	)
})

test("rewrites the client-hmr SSE endpoint to the DSH sidecar", () => {
	assert.equal(
		rewriteEventSourceUrl(
			"/plugins/events?rev=123",
			"http://localhost:5173",
			"http://127.0.0.1:43127",
		),
		"http://127.0.0.1:43127/plugins/events?rev=123",
	)
})

test("leaves unrelated EventSource URLs untouched", () => {
	assert.equal(
		rewriteEventSourceUrl("/api/events", "http://localhost:5173", "http://127.0.0.1:43127"),
		"http://localhost:5173/api/events",
	)
	assert.equal(
		rewriteEventSourceUrl(
			"http://127.0.0.1:43127/plugins/events",
			"http://localhost:5173",
			"http://127.0.0.1:43127",
		),
		"http://127.0.0.1:43127/plugins/events",
	)
})
