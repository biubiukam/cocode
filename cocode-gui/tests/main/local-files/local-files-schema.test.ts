import assert from "node:assert/strict"
import test from "node:test"
import { parseOpenLocalFileRequest } from "../../../src/contracts/schemas/local-files.schema"

test("accepts an absolute local file path", () => {
	const filePath =
		process.platform === "win32" ? "C:\\workspace\\report.docx" : "/workspace/report.docx"
	assert.deepEqual(parseOpenLocalFileRequest({ path: filePath }), { path: filePath })
})

test("rejects relative paths and non-path payloads", () => {
	assert.throws(() => parseOpenLocalFileRequest({ path: "report.docx" }))
	assert.throws(() => parseOpenLocalFileRequest({ path: "https://example.com/report.docx" }))
	assert.throws(() => parseOpenLocalFileRequest({ path: 42 }))
})
