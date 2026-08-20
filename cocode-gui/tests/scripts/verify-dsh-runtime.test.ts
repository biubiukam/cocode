import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"
import test from "node:test"
import { verifyRequiredWindowsNativePackages } from "../../scripts/verify-dsh-runtime.mjs"

function writePackage(root: string, name: string, manifest: Record<string, unknown>): string {
	const packageRoot = path.join(root, "node_modules", ...name.split("/"))
	mkdirSync(packageRoot, { recursive: true })
	writeFileSync(
		path.join(packageRoot, "package.json"),
		JSON.stringify({ name, version: "1.0.0", ...manifest }),
	)
	return packageRoot
}

function createPeFixture(machine = 0x8664): Buffer {
	const buffer = Buffer.alloc(0x80)
	buffer.writeUInt16LE(0x5a4d, 0)
	buffer.writeUInt32LE(0x40, 0x3c)
	buffer.write("PE\0\0", 0x40, "ascii")
	buffer.writeUInt16LE(machine, 0x44)
	return buffer
}

test("fails closed when a required Windows native optional package is missing", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-dsh-native-"))
	try {
		writePackage(root, "koffi", {})

		assert.throws(
			() => verifyRequiredWindowsNativePackages(root, { platform: "win32", arch: "x64" }),
			/@koromix\/koffi-win32-x64/,
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("accepts the target Windows native optional packages", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-dsh-native-"))
	try {
		writePackage(root, "koffi", {})
		writeFileSync(
			path.join(
				writePackage(root, "@koromix/koffi-win32-x64", {
					os: ["win32"],
					cpu: ["x64"],
				}),
				"koffi.node",
			),
			createPeFixture(),
		)
		writePackage(root, "node-addon-require-builtin", {})
		writeFileSync(
			path.join(
				writePackage(root, "node-addon-require-builtin-win32-x64-msvc", {
					os: ["win32"],
					cpu: ["x64"],
				}),
				"binding.node",
			),
			createPeFixture(),
		)
		writePackage(root, "@vscode/ripgrep", {})
		const ripgrepRoot = writePackage(root, "@vscode/ripgrep-win32-x64", {
			os: ["win32"],
			cpu: ["x64"],
		})
		mkdirSync(path.join(ripgrepRoot, "bin"), { recursive: true })
		writeFileSync(path.join(ripgrepRoot, "bin", "rg.exe"), createPeFixture())

		assert.doesNotThrow(() =>
			verifyRequiredWindowsNativePackages(root, { platform: "win32", arch: "x64" }),
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("rejects a Windows native package with the wrong PE architecture", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "cocode-dsh-native-"))
	try {
		writePackage(root, "koffi", {})
		writeFileSync(
			path.join(
				writePackage(root, "@koromix/koffi-win32-x64", {
					os: ["win32"],
					cpu: ["x64"],
				}),
				"koffi.node",
			),
			createPeFixture(0xaa64),
		)

		assert.throws(
			() => verifyRequiredWindowsNativePackages(root, { platform: "win32", arch: "x64" }),
			/architecture mismatch for x64/,
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
