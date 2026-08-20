import assert from "node:assert/strict"
import test from "node:test"
import { readJsonResponse } from "../../src/renderer/app/bootstrap/read-json-response"

test("reads a successful JSON bootstrap response", async () => {
	const response = new Response(JSON.stringify({ origin: "http://127.0.0.1:3080" }), {
		headers: { "content-type": "application/json; charset=utf-8" },
	})
	assert.deepEqual(await readJsonResponse(response, "DSH bootstrap"), {
		origin: "http://127.0.0.1:3080",
	})
})

test("reports an HTML fallback instead of exposing a JSON parse error", async () => {
	const response = new Response("<!DOCTYPE html><html></html>", {
		headers: { "content-type": "text/html; charset=utf-8" },
	})
	await assert.rejects(
		readJsonResponse(response, "DSH bootstrap"),
		/DSH bootstrap returned text\/html; charset=utf-8 instead of JSON: <!DOCTYPE html>/,
	)
})
