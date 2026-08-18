import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "pathe"
import test from "node:test"
import { ensureWorkspaceDependencies } from "../../scripts/lib/workspace-dependencies.mjs"

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
