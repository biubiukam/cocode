import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isDshHttpPath, isDshRuntimeRequestPath } from "../../../src/contracts/dsh-runtime-path"

describe("DSH runtime HTTP surface", () => {
	it("accepts the exact and nested allow-listed paths", () => {
		for (const path of [
			"/api",
			"/api/session.list",
			"/sidebar",
			"/sidebar/api/fs.tree",
			"/cocode/shortcuts",
			"/cocode/shortcuts/api/settings.get",
			"/cocode/workbench/api/fs.tree",
		]) {
			assert.equal(isDshHttpPath(path), true, path)
		}
	})

	it("accepts query strings only on request paths", () => {
		for (const path of [
			"/api?request=1",
			"/sidebar/api/fs.tree?depth=1",
			"/cocode/shortcuts/api/settings.get?scope=account",
			"/cocode/workbench/api/fs.tree?depth=1",
		]) {
			assert.equal(isDshRuntimeRequestPath(path), true, path)
		}
	})

	it("rejects lookalike or unrelated paths", () => {
		for (const path of [
			"/apiish",
			"/sidebarish/api",
			"/cocode/shortcutsish/api/settings.get",
			"/cocode/other/api",
			"/etc/passwd",
			"https://127.0.0.1:3080/api/session.list",
			"/api#fragment",
		]) {
			assert.equal(isDshHttpPath(path), false, path)
			assert.equal(isDshRuntimeRequestPath(path), false, path)
		}
	})
})
