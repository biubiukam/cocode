import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "pathe"
import test from "node:test"
import { DesktopLogger } from "../../src/main/shared/logging/desktop-logger"

test("writes desktop records with a source and event identity", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "cocode-desktop-log-"))
	const logger = new DesktopLogger({
		directory: root,
		serviceVersion: "test",
		defaultLevel: "debug",
		layout: "unified",
	})
	logger.info("desktop.test")
	logger.close()

	try {
		const line = await readFile(path.join(root, "desktop", "app", "current.jsonl"), "utf8")
		const record = JSON.parse(line) as Record<string, unknown>
		assert.equal(record.source, "desktop")
		assert.equal(typeof record.eventId, "string")
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
