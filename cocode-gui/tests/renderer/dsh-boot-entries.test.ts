import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
	DSH_CLIENT_HMR_ID,
	selectDshBootEntries,
} from "../../src/renderer/app/bootstrap/dsh-boot-entries"

const entries = [
	{ id: DSH_CLIENT_HMR_ID, url: "/plugins/hmr/client.js", rev: "hmr" },
	{ id: "@deepseek-ai/dsh-client-modules", url: "/plugins/modules/client.js", rev: "modules" },
] as const

describe("selectDshBootEntries", () => {
	it("keeps the HMR entry during development", () => {
		assert.deepEqual(selectDshBootEntries(entries, false), entries)
	})

	it("removes the dev-only HMR entry from packaged boot", () => {
		assert.deepEqual(selectDshBootEntries(entries, true), [entries[1]])
	})
})
