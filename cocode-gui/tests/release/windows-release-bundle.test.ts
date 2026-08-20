import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"
import test from "node:test"
import {
	assembleWindowsReleaseBundle,
	verifyWindowsReleaseBundle,
} from "../../scripts/release/windows-release-bundle.mjs"

test("assembles x64 and arm64 evidence into one immutable GitHub upload directory", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-windows-bundle-"))
	try {
		const x64 = createArchitectureRelease(root, "x64")
		const arm64 = createArchitectureRelease(root, "arm64")
		const outDir = path.join(root, "upload")
		const result = assembleWindowsReleaseBundle({ x64Dir: x64, arm64Dir: arm64, outDir })

		assert.equal(result.version, "1.2.3")
		assert.deepEqual(result.architectures, ["x64", "arm64"])
		for (const file of [
			"Cocode-1.2.3-x64.exe",
			"Cocode-1.2.3-arm64.exe",
			"x64.yml",
			"latest-x64.yml",
			"arm64.yml",
			"latest-arm64.yml",
			"windows-pe-signing-inventory-x64.json",
			"windows-pe-signing-inventory-arm64.json",
			"release-manifest.json",
			"SHA256SUMS",
		]) {
			assert.equal(result.files.includes(file), true, file)
		}
		const manifest = JSON.parse(readFileSync(path.join(outDir, "release-manifest.json"), "utf8"))
		assert.equal("gitCommit" in manifest, false)
		assert.equal(manifest.targets.x64.artifact.file, "Cocode-1.2.3-x64.exe")
		assert.equal(manifest.targets.arm64.artifact.file, "Cocode-1.2.3-arm64.exe")
		assert.doesNotThrow(() => verifyWindowsReleaseBundle(outDir))

		writeFileSync(path.join(outDir, "Cocode-1.2.3-arm64.exe"), "modified-after-upload")
		assert.throws(
			() => verifyWindowsReleaseBundle(outDir),
			/Windows release bundle hash mismatch/,
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

function createArchitectureRelease(
	root: string,
	arch: "x64" | "arm64",
): string {
	const directory = path.join(root, arch)
	mkdirSync(directory, { recursive: true })
	const installerName = `Cocode-1.2.3-${arch}.exe`
	const installer = Buffer.from(`final-signed-${arch}`)
	const sha256 = createHash("sha256").update(installer).digest("hex")
	const sha512 = createHash("sha512").update(installer).digest("base64")
	writeFileSync(path.join(directory, installerName), installer)
	const metadata = [
		"version: 1.2.3",
		"files:",
		`  - url: ${JSON.stringify(installerName)}`,
		`    sha512: ${JSON.stringify(sha512)}`,
		`path: ${JSON.stringify(installerName)}`,
		`sha512: ${JSON.stringify(sha512)}`,
		"",
	].join("\n")
	for (const name of [`${arch}.yml`, `latest-${arch}.yml`]) {
		writeFileSync(path.join(directory, name), metadata)
	}
	writeFileSync(
		path.join(directory, "windows-pe-signing-inventory.json"),
		JSON.stringify({
			schemaVersion: 1,
			files: [
				{ path: "Cocode.exe", extension: ".exe", signing: "required", status: "Valid" },
				{ path: "libvips.dll", extension: ".dll", signing: "excluded" },
			],
		}),
	)
	writeFileSync(
		path.join(directory, "release-manifest.json"),
		JSON.stringify({
			schemaVersion: 1,
				product: "Cocode",
				version: "1.2.3",
				target: { platform: "win32", arch },
			build: { hostArch: arch, createdAt: "2026-08-20T10:00:00.000Z" },
			artifact: { file: installerName, sha256, sha512 },
			signature: { status: "Valid", subject: "CN=Cocode", thumbprint: "AABB" },
			metadata: [`${arch}.yml`, `latest-${arch}.yml`],
		}),
	)
	return directory
}
