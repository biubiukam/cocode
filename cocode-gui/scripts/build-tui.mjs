import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import * as path from "pathe"
import { fileURLToPath, pathToFileURL } from "node:url"
import { shellCommandOptions } from "./lib/child-process-options.mjs"

const guiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tuiRoot = path.resolve(guiRoot, "../cocode-tui")
const supervisorRoot = path.resolve(guiRoot, "../cocode-host-supervisor")
export function buildTui({ output = defaultOutput() } = {}) {
	if (!existsSync(tuiRoot)) throw new Error(`TUI checkout not found: ${tuiRoot}`)

	const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack"
	execFileSync(corepack, ["pnpm@10.34.5", "run", "build"], {
		...shellCommandOptions({ cwd: tuiRoot, stdio: "inherit" }),
	})

	const sourceEntry = path.join(tuiRoot, "dist", "cocode-tui.mjs")
	const sourceMeta = path.join(tuiRoot, "dist", "cocode-tui.meta.json")
	if (!existsSync(sourceEntry)) throw new Error(`TUI build did not emit ${sourceEntry}`)
	if (!existsSync(sourceMeta)) throw new Error(`TUI build did not emit ${sourceMeta}`)

	rmSync(output, { recursive: true, force: true })
	mkdirSync(output, { recursive: true })
	copyFileSync(sourceEntry, path.join(output, "cocode-tui.mjs"))
	copyFileSync(sourceMeta, path.join(output, "cocode-tui.meta.json"))

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
	const entryHash = sha256File(path.join(output, "cocode-tui.mjs"))
	const buildId = process.env.GITHUB_SHA?.trim() || `local-${entryHash.slice(0, 12)}`

	const manifest = {
		schemaVersion: 1,
		productVersion: String(guiPackage.version),
		tuiVersion: String(tuiPackage.version),
		supervisorVersion: String(supervisorPackage.version),
		dshRuntimeVersion: String(runtimeManifest?.dsh?.version ?? "unknown"),
		protocolRevision: "1.0",
		entry: "tui/cocode-tui.mjs",
		sha256: entryHash,
		buildId,
	}
	writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
	console.log(`[tui-build] staged ${output}`)
	return { output, manifest }
}

function defaultOutput() {
	return path.resolve(
		process.env.COCODE_TUI_ARTIFACT_ROOT?.trim() ||
			path.join(guiRoot, ".cache", "cocode", "tui"),
	)
}

function readJson(file) {
	return JSON.parse(readFileSync(file, "utf8"))
}

function sha256File(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex")
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
	const outputIndex = process.argv.indexOf("--output")
	buildTui(outputIndex >= 0 ? { output: path.resolve(process.argv[outputIndex + 1]) } : {})
}
