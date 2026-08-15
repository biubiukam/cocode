import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"
import { copyWorkspaceFallback } from "../../scripts/stage-dsh-runtime-workspace-fallback.mjs"

const temporaryDirectories: string[] = []

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true })
	}
})

test("workspace fallback does not overwrite deployed external dependencies", () => {
	const root = createTemporaryDirectory("dsh-source-")
	const target = createTemporaryDirectory("dsh-target-")
	const sourceModules = path.join(root, "node_modules", ".pnpm", "node_modules")
	const workspacePackage = path.join(root, "packages", "runtime", "invariants")
	const externalPackage = path.join(
		root,
		"node_modules",
		".pnpm",
		"commander@7.2.0",
		"node_modules",
		"commander",
	)

	writeManifest(workspacePackage, "@deepseek-ai/dsh-invariants", "workspace")
	writeManifest(externalPackage, "commander", "7.2.0")
	mkdirSync(path.join(sourceModules, "@deepseek-ai"), { recursive: true })
	symlinkSync(workspacePackage, path.join(sourceModules, "@deepseek-ai", "dsh-invariants"), "dir")
	symlinkSync(externalPackage, path.join(sourceModules, "commander"), "dir")
	writeManifest(path.join(target, "node_modules", "commander"), "commander", "15.0.0")

	copyWorkspaceFallback(root, target)

	assert.equal(readVersion(path.join(target, "node_modules", "commander")), "15.0.0")
	assert.equal(
		readVersion(path.join(target, "node_modules", "@deepseek-ai", "dsh-invariants")),
		"workspace",
	)
})

function createTemporaryDirectory(prefix: string): string {
	const directory = mkdtempSync(path.join(os.tmpdir(), prefix))
	temporaryDirectories.push(directory)
	return directory
}

function writeManifest(directory: string, name: string, version: string): void {
	mkdirSync(directory, { recursive: true })
	writeFileSync(
		path.join(directory, "package.json"),
		`${JSON.stringify({ name, version }, null, 2)}\n`,
	)
}

function readVersion(directory: string): string {
	const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
		readonly version: string
	}
	return manifest.version
}
