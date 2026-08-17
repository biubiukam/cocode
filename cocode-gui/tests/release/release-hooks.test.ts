import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"
import test from "node:test"
import type { ForgeMakeResult } from "@electron-forge/shared-types"
import {
	findMacAppWithTui,
	normalizeArtifactNames,
	selectGitHubReleaseArtifacts,
} from "../../scripts/release/release-hooks"

test("normalizes macOS DMG, ZIP and PKG artifact names with platform and architecture", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-release-hooks-"))
	try {
		const dmg = path.join(root, "Cocode Desktop.dmg")
		const zip = path.join(root, "Cocode Desktop.zip")
		const pkg = path.join(root, "Cocode Desktop.pkg")
		writeFileSync(dmg, "dmg")
		writeFileSync(zip, "zip")
		writeFileSync(pkg, "pkg")
		const result: ForgeMakeResult = {
			platform: "darwin",
			arch: "arm64",
			packageJSON: { version: "1.2.3" },
			artifacts: [dmg, zip, pkg],
		}
		const [normalized] = normalizeArtifactNames([result])
		assert.deepEqual(normalized?.artifacts, [
			path.join(root, "Cocode-Desktop-1.2.3-darwin-arm64.dmg"),
			path.join(root, "Cocode-Desktop-1.2.3-darwin-arm64.zip"),
			path.join(root, "Cocode-Desktop-1.2.3-darwin-arm64.pkg"),
		])
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("does not publish Windows arm64 Squirrel feed metadata to the shared feed", () => {
	const result: ForgeMakeResult = {
		platform: "win32",
		arch: "arm64",
		packageJSON: { version: "1.2.3" },
		artifacts: ["/tmp/arm64-Setup.exe", "/tmp/RELEASES", "/tmp/arm64.nupkg"],
	}
	const [selected] = selectGitHubReleaseArtifacts([result])
	assert.deepEqual(selected?.artifacts, ["/tmp/arm64-Setup.exe"])
})

test("skips files while searching for the packaged macOS app", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-release-hooks-"))
	try {
		mkdirSync(path.join(root, "runtime"), { recursive: true })
		writeFileSync(path.join(root, "runtime", "README.md"), "runtime")
		const appPath = path.join(root, "Cocode.app")
		mkdirSync(path.join(appPath, "Contents", "Resources", "tui"), { recursive: true })
		writeFileSync(path.join(appPath, "Contents", "Resources", "tui", "manifest.json"), "{}")

		assert.equal(findMacAppWithTui(root), appPath)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
