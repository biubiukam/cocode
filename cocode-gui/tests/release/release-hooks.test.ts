import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { ForgeMakeResult } from "@electron-forge/shared-types"
import { normalizeArtifactNames } from "../../scripts/release/release-hooks"

test("normalizes macOS DMG and ZIP artifact names with platform and architecture", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-release-hooks-"))
	try {
		const dmg = path.join(root, "Cocode Desktop.dmg")
		const zip = path.join(root, "Cocode Desktop.zip")
		writeFileSync(dmg, "dmg")
		writeFileSync(zip, "zip")
		const result: ForgeMakeResult = {
			platform: "darwin",
			arch: "arm64",
			packageJSON: { version: "1.2.3" },
			artifacts: [dmg, zip],
		}
		const [normalized] = normalizeArtifactNames([result])
		assert.deepEqual(normalized?.artifacts, [
			path.join(root, "Cocode-Desktop-1.2.3-darwin-arm64.dmg"),
			path.join(root, "Cocode-Desktop-1.2.3-darwin-arm64.zip"),
		])
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
