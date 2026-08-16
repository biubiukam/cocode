import test from "node:test"
import assert from "node:assert/strict"
import { RendererLogger } from "../../../src/renderer/shared/logging/renderer-logger"

test("renderer logger batches normal records and flushes warnings immediately", () => {
	const batches: unknown[][] = []
	const previousWindow = (globalThis as { window?: unknown }).window
	;(globalThis as { window: unknown }).window = {
		setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
		clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
		desktopApi: {
			diagnostics: { log: { writeBatch: (records: unknown[]) => batches.push(records) } },
		},
	}
	try {
		const logger = new RendererLogger()
		logger.info("renderer.test.started")
		assert.equal(batches.length, 0)
		logger.warn("renderer.test.warning")
		assert.equal(batches.length, 1)
		assert.equal(batches[0]?.length, 2)
		assert.equal((batches[0]?.[1] as { eventName: string }).eventName, "renderer.test.warning")
	} finally {
		if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window
		else (globalThis as { window: unknown }).window = previousWindow
	}
})
