import assert from "node:assert/strict"
import * as path from "pathe"
import test from "node:test"
import { electronDefaultAppTemporaryPrefix } from "../../scripts/lib/electron-default-app-paths.mjs"

test("creates the Electron default-app temporary directory beside the archive", () => {
	const defaultAppArchive = path.join(
		"workspace",
		"node_modules",
		"electron",
		"dist",
		"resources",
		"default_app.asar",
	)

	assert.equal(
		electronDefaultAppTemporaryPrefix(defaultAppArchive),
		path.join(path.dirname(defaultAppArchive), ".cocode-electron-default-app-"),
	)
})
