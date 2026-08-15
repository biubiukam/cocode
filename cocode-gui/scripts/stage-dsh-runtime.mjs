import { execFileSync } from "node:child_process"
import {
	cpSync,
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { buildCocodePlugins, stageCocodePlugins } from "./cocode-plugins.mjs"

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
 * pnpm does not install workspace peer dependencies into a deploy when the
 * source workspace disables automatic peer installation. DSH imports several
 * of those peers at runtime (for example cordis-plugin-group and schemastery),
 * so copy the source workspace packages into the flat deployed node_modules.
 * Each package is copied without its own node_modules; the deploy's hoisted
 * dependency tree remains the single owner of external dependencies.
 */
function copyWorkspaceFallback(sourceRoot, target) {
	const sourceModules = path.join(sourceRoot, "node_modules", ".pnpm", "node_modules")
	const targetModules = path.join(target, "node_modules")
	if (!existsSync(sourceModules)) return

	for (const scopeOrPackage of readdirSync(sourceModules)) {
		const sourceScope = path.join(sourceModules, scopeOrPackage)
		const sourceStat = lstatSafe(sourceScope)
		if (sourceStat?.isDirectory() && scopeOrPackage.startsWith("@")) {
			for (const packageName of readdirSync(sourceScope)) {
				copyWorkspacePackage(
					path.join(sourceScope, packageName),
					path.join(targetModules, scopeOrPackage, packageName),
					sourceRoot,
				)
			}
		} else {
			copyWorkspacePackage(sourceScope, path.join(targetModules, scopeOrPackage), sourceRoot)
		}
	}
}

function copyWorkspacePackage(source, target, sourceRoot) {
	const resolved = realpathSafe(source)
	if (!resolved || !isWorkspacePath(resolved, sourceRoot) || existsSync(target)) return
	mkdirSync(path.dirname(target), { recursive: true })
	cpSync(source, target, {
		recursive: true,
		dereference: true,
		filter: (entry) => path.basename(entry) !== "node_modules",
	})
}

function isWorkspacePath(candidate, sourceRoot) {
	const relative = path.relative(sourceRoot, candidate)
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function lstatSafe(file) {
	try {
		return lstatSync(file)
	} catch {
		return undefined
	}
}

function realpathSafe(file) {
	try {
		return realpathSync(file)
	} catch {
		return undefined
	}
}
