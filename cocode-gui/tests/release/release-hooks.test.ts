import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"
import test from "node:test"
import type { ForgeMakeResult } from "@electron-forge/shared-types"
import {
	extractWindowsArchiveEntries,
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

test("omits Squirrel feed files from Windows GitHub artifacts", () => {
	const x64: ForgeMakeResult = {
		platform: "win32",
		arch: "x64",
		packageJSON: { version: "1.2.3" },
		artifacts: ["/tmp/x64.msix", "/tmp/RELEASES", "/tmp/x64.nupkg"],
	}
	const arm64: ForgeMakeResult = {
		platform: "win32",
		arch: "arm64",
		packageJSON: { version: "1.2.3" },
		artifacts: ["/tmp/arm64.msix", "/tmp/RELEASES", "/tmp/arm64.nupkg"],
	}
	const [selectedX64, selectedArm64] = selectGitHubReleaseArtifacts([x64, arm64])
	assert.deepEqual(selectedX64?.artifacts, ["/tmp/x64.msix"])
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
	assert.match(script, /SubjectUtf8/)
	assert.match(script, /UTF8\.GetBytes/)
})

test("extracts only Windows archive executables to short destination names", async (t) => {
	if (process.platform !== "win32") {
		t.skip("Windows archive extraction requires PowerShell")
		return
	}
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-zip-extract-"))
	try {
		const archive = path.join(root, "package.nupkg")
		const longName = `lib/net45/${"a".repeat(180)}/skip.txt`
		writeWindowsTestZip(archive, [
			{ name: longName, body: "skip" },
			{ name: "lib/net45/Cocode.exe", body: "mz" },
			{ name: "AppxManifest.xml", body: "<Identity Name='Cocode' />" },
		])
		const extracted = extractWindowsArchiveEntries({
			archivePath: archive,
			destination: path.join(root, "exes"),
			mode: "executables",
		})
		assert.equal(extracted.length, 1)
		assert.match(extracted[0] ?? "", /0000-Cocode\.exe$/)
		assert.ok((extracted[0]?.length ?? 0) < 260)
		const named = extractWindowsArchiveEntries({
			archivePath: archive,
			destination: path.join(root, "named"),
			mode: "named",
			names: ["AppxManifest.xml", "app\\Cocode.exe"],
		})
		assert.equal(named.length, 1)
		assert.match(named[0] ?? "", /AppxManifest\.xml$/)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

function writeWindowsTestZip(
	file: string,
	entries: readonly { readonly name: string; readonly body: string }[],
): void {
	const spec = path.join(path.dirname(file), "zip-spec.json")
	writeFileSync(spec, `${JSON.stringify(entries)}\n`)
	execFileSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			[
				"$ErrorActionPreference='Stop'",
				"Add-Type -AssemblyName System.IO.Compression.FileSystem",
				"$zip = [IO.Compression.ZipFile]::Open($env:ZIP_OUT, 'Create')",
				"try {",
				"  foreach ($item in (Get-Content -LiteralPath $env:ZIP_SPEC -Encoding UTF8 -Raw | ConvertFrom-Json)) {",
				"    $entry = $zip.CreateEntry($item.name)",
				"    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$item.body)",
				"    $stream = $entry.Open()",
				"    $stream.Write($bytes, 0, $bytes.Length)",
				"    $stream.Dispose()",
				"  }",
				"} finally { $zip.Dispose() }",
			].join("\n"),
		],
		{ env: { ...process.env, ZIP_OUT: file, ZIP_SPEC: spec } },
	)
}

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
