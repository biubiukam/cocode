import { execFileSync } from "node:child_process"
import {
	cpSync,
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { buildCocodePlugins, stageCocodePlugins } from "./cocode-plugins.mjs"
import { copyWorkspaceFallback } from "./stage-dsh-runtime-workspace-fallback.mjs"

const destination = readArgument("--destination")
const runtimeRoot = process.env.DSH_RUNTIME_ROOT
const sourceRoot = process.env.DSH_SOURCE_ROOT ?? path.resolve(process.cwd(), "../cocode-harness")

if (!destination) {
	console.error("Usage: node scripts/stage-dsh-runtime.mjs --destination <directory>")
	process.exit(2)
}

buildCocodePlugins()

if (runtimeRoot) {
	copyRuntime(runtimeRoot, destination, sourceRoot)
	stageCocodePlugins(destination)
	process.exit(0)
}

if (!existsSync(path.join(sourceRoot, "apps", "cli", "package.json"))) {
	throw new Error(`DSH source checkout was not found at ${sourceRoot}. Set DSH_SOURCE_ROOT.`)
}

const staging = mkdtempSync(path.join(os.tmpdir(), "dsh-desktop-runtime-"))
try {
	execFileSync(
		"pnpm",
		[
			"deploy",
			"--legacy",
			"--config.node-linker=hoisted",
			"--filter",
			"@deepseek-ai/dsh",
			"--prod",
			"--ignore-scripts",
			staging,
		],
		{ cwd: sourceRoot, stdio: "inherit" },
	)
	copyRuntime(staging, destination, sourceRoot)
	stageCocodePlugins(destination)
} finally {
	rmSync(staging, { recursive: true, force: true })
}

function readArgument(name) {
	const index = process.argv.indexOf(name)
	return index === -1 ? undefined : process.argv[index + 1]
}

function copyRuntime(source, target, sourceRoot) {
	const entry = path.join(source, "lib", "bin.js")
	if (!existsSync(entry)) throw new Error(`The staged DSH runtime has no lib/bin.js: ${source}`)
	rmSync(target, { recursive: true, force: true })
	mkdirSync(target, { recursive: true })
	cpSync(source, target, { recursive: true, dereference: true })
	if (sourceRoot) copyWorkspaceFallback(sourceRoot, target)
	aliasCocodeScopePackages(target)
	restoreNodePtyHelper(target)
	console.log(`Staged DSH runtime at ${target}`)
}

function restoreNodePtyHelper(target) {
	const packageRoot = path.join(target, "node_modules", "node-pty")
	const candidates = [
		path.join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
		path.join(packageRoot, "build", "Release", "spawn-helper"),
	]
	for (const helper of candidates) {
		if (existsSync(helper)) chmodSync(helper, 0o755)
	}
}

/**
 * Host packages import the product namespace (`@cocode/dsh-*`) while pnpm deploy
 * still materializes upstream names (`@deepseek-ai/dsh-*`). Mirror deployed DSH
 * packages under the Cocode scope so the sidecar can resolve those imports.
 */
function aliasCocodeScopePackages(target) {
	const targetModules = path.join(target, "node_modules")
	const sourceScope = path.join(targetModules, "@deepseek-ai")
	const aliasScope = path.join(targetModules, "@cocode")
	if (!existsSync(sourceScope)) return

	mkdirSync(aliasScope, { recursive: true })
	for (const packageName of readdirSync(sourceScope)) {
		if (!packageName.startsWith("dsh-")) continue
		const source = path.join(sourceScope, packageName)
		if (!lstatSafe(source)?.isDirectory()) continue
		const aliasTarget = path.join(aliasScope, packageName)
		if (existsSync(aliasTarget)) continue

		mkdirSync(aliasTarget, { recursive: true })
		for (const entry of readdirSync(source)) {
			if (entry === "node_modules") continue
			const entrySource = path.join(source, entry)
			const entryTarget = path.join(aliasTarget, entry)
			if (entry === "package.json") {
				const manifest = JSON.parse(readFileSync(entrySource, "utf8"))
				manifest.name = `@cocode/${packageName}`
				writeFileSync(entryTarget, `${JSON.stringify(manifest, null, 2)}\n`)
				continue
			}
			cpSync(entrySource, entryTarget, { recursive: true, dereference: true })
		}
	}
}

function lstatSafe(file) {
	try {
		return lstatSync(file)
	} catch {
		return undefined
	}
}
