import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "pathe"
import test from "node:test"
import { esbuildPlatformPackagePath } from "../../scripts/build-tui.mjs"
import {
	ensureWindowsNodePtyNatives,
	ensureWorkspaceDependencies,
} from "../../scripts/lib/workspace-dependencies.mjs"

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

test("repairs missing Windows node-pty native files with the target architecture", () => {
	const root = mkdtempSync(path.join(tmpdir(), "cocode-node-pty-native-test-"))
	const release = path.join(root, "node_modules", "node-pty", "prebuilds", "win32-x64")
	const required = [
		path.join(release, "conpty", "conpty.dll"),
		path.join(release, "conpty", "OpenConsole.exe"),
		path.join(release, "conpty.node"),
		path.join(release, "pty.node"),
		path.join(release, "winpty-agent.exe"),
	]
	const calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = []
	try {
		assert.equal(
			ensureWindowsNodePtyNatives({
				root,
				platform: "win32",
				arch: "x64",
				run(command, args, options) {
					calls.push({ command, args, env: options?.env })
					for (const file of required) {
						mkdirSync(path.dirname(file), { recursive: true })
						writeFileSync(file, "native")
					}
				},
			}),
			true,
		)
		assert.equal(calls.length, 1)
		assert.deepEqual(calls[0]?.args, ["pnpm@10.34.5", "rebuild", "node-pty"])
		assert.equal(calls[0]?.env?.npm_config_arch, "x64")
		assert.deepEqual(
			ensureWindowsNodePtyNatives({ root, platform: "win32", arch: "x64" }),
			false,
		)
		assert.equal(
			ensureWindowsNodePtyNatives({
				root,
				platform: "win32",
				arch: "arm64",
				force: true,
				run(command, args, options) {
					calls.push({ command, args, env: options?.env })
					const arm64 = path.join(
						root,
						"node_modules",
						"node-pty",
						"prebuilds",
						"win32-arm64",
					)
					for (const relative of [
						"pty.node",
						"winpty-agent.exe",
						"conpty.node",
						path.join("conpty", "conpty.dll"),
						path.join("conpty", "OpenConsole.exe"),
					]) {
						const file = path.join(arm64, relative)
						mkdirSync(path.dirname(file), { recursive: true })
						writeFileSync(file, "native")
					}
				},
			}),
			true,
		)
		assert.equal(calls.at(-1)?.env?.npm_config_arch, "arm64")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})
