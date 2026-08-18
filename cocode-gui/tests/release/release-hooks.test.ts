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

test("normalizes Windows MSIX names by architecture", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-release-hooks-"))
	try {
		const msix = path.join(root, "Cocode.msix")
		writeFileSync(msix, "msix")
		const result: ForgeMakeResult = {
			platform: "win32",
			arch: "arm64",
			packageJSON: { version: "1.2.3" },
			artifacts: [msix],
		}
		const [normalized] = normalizeArtifactNames([result])
		assert.deepEqual(normalized?.artifacts, [
			path.join(root, "Cocode-Desktop-1.2.3-win32-arm64.msix"),
		])
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("publishes x64 Squirrel metadata but filters ARM64 metadata", () => {
	const x64: ForgeMakeResult = {
		platform: "win32",
		arch: "x64",
		packageJSON: { version: "1.2.3" },
		artifacts: ["/tmp/x64-Setup.exe", "/tmp/RELEASES", "/tmp/x64.nupkg"],
	}
	const arm64: ForgeMakeResult = {
		platform: "win32",
		arch: "arm64",
		packageJSON: { version: "1.2.3" },
		artifacts: ["/tmp/arm64.msix", "/tmp/RELEASES", "/tmp/arm64.nupkg"],
	}
	const [selectedX64, selectedArm64] = selectGitHubReleaseArtifacts([x64, arm64])
	assert.deepEqual(selectedX64?.artifacts, x64.artifacts)
	assert.deepEqual(selectedArm64?.artifacts, ["/tmp/arm64.msix"])
})

test("preserves non-feed Windows ARM64 manual installers", () => {
	const result: ForgeMakeResult = {
		platform: "win32",
		arch: "arm64",
		packageJSON: { version: "1.2.3" },
		artifacts: ["/tmp/Cocode-Desktop-1.2.3-win32-arm64-Setup.exe"],
	}
	const [selected] = selectGitHubReleaseArtifacts([result])
	assert.deepEqual(selected?.artifacts, result.artifacts)
})

test("separates Windows Authenticode PowerShell statements", async () => {
	const hooks = (await import("../../scripts/release/release-hooks")) as {
		buildWindowsAuthenticodeVerificationScript?: () => string
	}
	assert.equal(typeof hooks.buildWindowsAuthenticodeVerificationScript, "function")
	const script = hooks.buildWindowsAuthenticodeVerificationScript?.() ?? ""
	assert.match(script, /\$env:VERIFY_FILE;\s+if/)
	assert.doesNotMatch(script, /\$env:VERIFY_FILE\s+if/)
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
