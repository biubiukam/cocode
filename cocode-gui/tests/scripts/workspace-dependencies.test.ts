import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "pathe"
import test from "node:test"
import { esbuildPlatformPackagePath } from "../../scripts/build-tui.mjs"
import { ensureWorkspaceDependencies } from "../../scripts/lib/workspace-dependencies.mjs"

test("resolves the esbuild package for the active platform and architecture", () => {
	assert.equal(
		esbuildPlatformPackagePath("/workspace/cocode-tui", "darwin", "x64"),
		path.join(
			"/workspace/cocode-tui",
			"node_modules",
			"@esbuild",
			"darwin-x64",
			"package.json",
		),
	)
})

test("reports when a workspace already has its required dependencies", () => {
	const root = mkdtempSync(path.join(tmpdir(), "cocode-workspace-dependencies-test-"))
	const requiredPath = path.join(root, "node_modules", "esbuild", "package.json")
	mkdirSync(path.dirname(requiredPath), { recursive: true })
	writeFileSync(requiredPath, "{}\n")

	assert.equal(
		ensureWorkspaceDependencies({
			root,
			label: "test workspace",
			requiredPaths: [requiredPath],
		}),
		false,
	)
})
