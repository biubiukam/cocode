import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import * as path from "pathe"
import { fileURLToPath, pathToFileURL } from "node:url"
import { shellCommandOptions } from "./lib/child-process-options.mjs"

const guiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tuiRoot = path.resolve(guiRoot, "../cocode-tui")
const supervisorRoot = path.resolve(guiRoot, "../cocode-host-supervisor")
const outputRoot = path.join(guiRoot, ".cache", "cocode", "tui")

export function buildTui({ output = outputRoot } = {}) {
	if (!existsSync(tuiRoot)) throw new Error(`TUI checkout not found: ${tuiRoot}`)

	const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack"
	execFileSync(corepack, ["pnpm@10.34.5", "run", "build"], {
		...shellCommandOptions({ cwd: tuiRoot, stdio: "inherit" }),
	})

	const sourceEntry = path.join(tuiRoot, "dist", "cocode-tui.mjs")
	const sourceMeta = path.join(tuiRoot, "dist", "cocode-tui.meta.json")
	const sourceCli = path.join(tuiRoot, "bin", "cocode-tui.mjs")
	const sourceCliModule = path.join(tuiRoot, "bin", "cli.mjs")
	if (!existsSync(sourceEntry)) throw new Error(`TUI build did not emit ${sourceEntry}`)
	if (!existsSync(sourceMeta)) throw new Error(`TUI build did not emit ${sourceMeta}`)
	if (!existsSync(sourceCli)) throw new Error(`TUI CLI entry is missing: ${sourceCli}`)
	if (!existsSync(sourceCliModule))
		throw new Error(`TUI CLI module is missing: ${sourceCliModule}`)

	rmSync(output, { recursive: true, force: true })
	mkdirSync(output, { recursive: true })
	copyFileSync(sourceEntry, path.join(output, "cocode-tui.mjs"))
	copyFileSync(sourceMeta, path.join(output, "cocode-tui.meta.json"))
	copyFileSync(sourceCli, path.join(output, "cocode-cli.mjs"))
	copyFileSync(sourceCliModule, path.join(output, "cli.mjs"))

	const guiPackage = readJson(path.join(guiRoot, "package.json"))
	const tuiPackage = readJson(path.join(tuiRoot, "package.json"))
	const supervisorPackage = readJson(path.join(supervisorRoot, "package.json"))
	const runtimeManifestPath = path.resolve(
		process.env.COCODE_RUNTIME_ARTIFACT_ROOT?.trim() ||
			path.join(guiRoot, ".cache", "cocode", "release-runtime"),
		"runtime-manifest.json",
	)
	const runtimeManifest = existsSync(runtimeManifestPath)
		? readJson(runtimeManifestPath)
		: undefined
	const runtimeHash = sha256File(path.join(output, "cocode-tui.mjs"))
	const cliHash = sha256File(path.join(output, "cocode-cli.mjs"))
	const buildId = process.env.GITHUB_SHA?.trim() || `local-${runtimeHash.slice(0, 12)}`

	const manifest = {
		schemaVersion: 1,
		productVersion: String(guiPackage.version),
		tuiVersion: String(tuiPackage.version),
		supervisorVersion: String(supervisorPackage.version),
		dshRuntimeVersion: String(runtimeManifest?.dsh?.version ?? "unknown"),
		protocolRevision: "1.0",
		entry: "tui/cocode-cli.mjs",
		sha256: cliHash,
		runtimeSha256: runtimeHash,
		buildId,
	}
	writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
	console.log(`[tui-build] staged ${output}`)
	return { output, manifest }
}

function readJson(file) {
	return JSON.parse(readFileSync(file, "utf8"))
}

function sha256File(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex")
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
	buildTui()
}
