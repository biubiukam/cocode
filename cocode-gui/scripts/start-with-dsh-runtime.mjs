import { fork, spawn, spawnSync } from "node:child_process"
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"

const configuredRuntimeRoot = process.env.DSH_RUNTIME_ROOT
const disableRuntimeCache = process.env.DSH_DISABLE_RUNTIME_CACHE === "1"
const useRuntimeCache = !configuredRuntimeRoot && !disableRuntimeCache
const runtimeRoot =
	configuredRuntimeRoot ??
	(useRuntimeCache
		? resolveDefaultRuntimeRoot()
		: mkdtempSync(path.join(os.tmpdir(), "dsh-desktop-dev-")))
const stageScript = path.resolve("scripts/stage-dsh-runtime.mjs")
const clientWatcherScript = path.resolve("scripts/watch-dsh-client.mjs")
let clientWatcher
let electron
let stopping = false

try {
	if (useRuntimeCache) ensureRuntimeStaged(runtimeRoot)
	else if (!configuredRuntimeRoot) stageRuntime(runtimeRoot)

	clientWatcher = fork(clientWatcherScript, ["--runtime-root", runtimeRoot], {
		stdio: ["inherit", "inherit", "inherit", "ipc"],
		cwd: process.cwd(),
		env: process.env,
		execArgv: ["--import", "tsx/esm"],
	})
	await waitForClientWatcher(clientWatcher)

	electron = spawn("pnpm", ["exec", "electron-forge", "start"], {
		stdio: "inherit",
		cwd: process.cwd(),
		env: { ...process.env, DSH_RUNTIME_ROOT: runtimeRoot },
	})

	const forwardSignal = (signal) => {
		stopping = true
		if (electron && !electron.killed) electron.kill(signal)
		if (clientWatcher && !clientWatcher.killed) clientWatcher.kill(signal)
	}
	process.once("SIGINT", () => forwardSignal("SIGINT"))
	process.once("SIGTERM", () => forwardSignal("SIGTERM"))

	let clientWatcherFailure
	clientWatcher.once("exit", (code, signal) => {
		if (stopping) return
		clientWatcherFailure = new Error(
			`DSH client watcher exited unexpectedly (code=${String(code)}, signal=${String(
				signal,
			)}).`,
		)
		if (electron && !electron.killed) electron.kill("SIGTERM")
	})

	const exitCode = await new Promise((resolve, reject) => {
		electron.once("error", reject)
		electron.once("exit", (code, signal) => {
			resolve(code ?? (signal ? 1 : 0))
		})
	})
	if (clientWatcherFailure) throw clientWatcherFailure
	process.exitCode = exitCode
} finally {
	stopping = true
	if (electron && !electron.killed) electron.kill("SIGTERM")
	if (clientWatcher && !clientWatcher.killed) clientWatcher.kill("SIGTERM")
	await waitForChildExit(clientWatcher)
	if (!configuredRuntimeRoot && !useRuntimeCache)
		rmSync(runtimeRoot, { recursive: true, force: true })
}

function resolveDefaultRuntimeRoot() {
	if (process.env.DSH_RUNTIME_CACHE_ROOT) {
		return path.resolve(process.env.DSH_RUNTIME_CACHE_ROOT)
	}
	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Library", "Caches", "cocode", "dsh-runtime")
	}
	if (process.platform === "win32") {
		return path.join(
			process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
			"Cocode",
			"dsh-runtime",
		)
	}
	return path.join(
		process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
		"cocode",
		"dsh-runtime",
	)
}

function stageRuntime(destination) {
	const staged = spawnSync(process.execPath, [stageScript, "--destination", destination], {
		stdio: "inherit",
		cwd: process.cwd(),
		env: process.env,
	})
	if (staged.error) throw staged.error
	if (staged.status !== 0) {
		throw new Error(`DSH runtime staging failed with code ${String(staged.status)}.`)
	}
}

function ensureRuntimeStaged(destination) {
	const metadataPath = path.join(destination, ".cocode-runtime-cache.json")
	const fingerprint = createRuntimeFingerprint()
	const forceRestage = process.env.DSH_FORCE_RESTAGE === "1"
	if (!forceRestage && existsSync(path.join(destination, "lib", "bin.js"))) {
		try {
			const metadata = JSON.parse(readFileSync(metadataPath, "utf8"))
			if (metadata.fingerprint === fingerprint) {
				console.log(`[dsh-runtime] reusing cached runtime at ${destination}`)
				return
			}
		} catch {
			// A missing or incomplete marker is treated as a cache miss.
		}
	}

	mkdirSync(path.dirname(destination), { recursive: true })
	console.log(`[dsh-runtime] staging runtime at ${destination}`)
	const stagingRoot = mkdtempSync(path.join(path.dirname(destination), ".dsh-runtime-stage-"))
	const stagedDestination = path.join(stagingRoot, "runtime")
	try {
		stageRuntime(stagedDestination)
		writeFileSync(
			path.join(stagedDestination, ".cocode-runtime-cache.json"),
			`${JSON.stringify({ fingerprint }, null, 2)}\n`,
		)
		rmSync(destination, { recursive: true, force: true })
		renameSync(stagedDestination, destination)
	} finally {
		rmSync(stagingRoot, { recursive: true, force: true })
	}
}

function createRuntimeFingerprint() {
	const sourceRoot =
		process.env.DSH_SOURCE_ROOT ?? path.resolve(process.cwd(), "../cocode-harness")
	const repositoryRoot = process.cwd()
	return JSON.stringify({
		version: 1,
		platform: process.platform,
		arch: process.arch,
		sourceRoot,
		harness: [
			fileSignature(path.join(sourceRoot, "package.json")),
			fileSignature(path.join(sourceRoot, "pnpm-lock.yaml")),
			fileSignature(path.join(sourceRoot, "pnpm-workspace.yaml")),
			fileSignature(path.join(sourceRoot, "apps", "cli", "package.json")),
			directorySignature(path.join(sourceRoot, "apps", "cli", "lib")),
			directorySignature(path.join(sourceRoot, "packages")),
		],
		cocode: [
			...pluginFingerprintEntries(path.join(repositoryRoot, "packages", "cocode")),
			fileSignature(path.join(repositoryRoot, "scripts", "stage-dsh-runtime.mjs")),
			fileSignature(path.join(repositoryRoot, "scripts", "cocode-plugins.mjs")),
		],
	})
}

function pluginFingerprintEntries(root) {
	let entries
	try {
		entries = readdirSync(root, { withFileTypes: true })
	} catch {
		return [[root, null]]
	}
	return entries
		.filter((entry) => entry.isDirectory())
		.sort((left, right) => left.name.localeCompare(right.name))
		.flatMap((entry) => {
			const pluginRoot = path.join(root, entry.name)
			return [
				fileSignature(path.join(pluginRoot, "package.json")),
				fileSignature(path.join(pluginRoot, "tsconfig.build.json")),
				fileSignature(path.join(pluginRoot, "tsdown.config.ts")),
				directorySignature(path.join(pluginRoot, "src"), new Set(["client"])),
			]
		})
}

function fileSignature(file) {
	try {
		const stat = statSync(file)
		return [file, stat.size, stat.mtimeMs]
	} catch {
		return [file, null]
	}
}

function directorySignature(root, ignoredDirectoryNames = new Set()) {
	let count = 0
	let latestMtime = 0
	const visit = (directory) => {
		let entries
		try {
			entries = readdirSync(directory, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				(entry.isDirectory() && ignoredDirectoryNames.has(entry.name))
			)
				continue
			const entryPath = path.join(directory, entry.name)
			if (entry.isDirectory()) visit(entryPath)
			else {
				count += 1
				try {
					latestMtime = Math.max(latestMtime, statSync(entryPath).mtimeMs)
				} catch {
					// The file may disappear while the developer is editing it.
				}
			}
		}
	}
	visit(root)
	return [root, count, latestMtime]
}

function waitForClientWatcher(child) {
	return new Promise((resolve, reject) => {
		const timeoutMs = Number(process.env.DSH_CLIENT_WATCH_TIMEOUT_MS ?? 300_000)
		const timer = setTimeout(() => {
			reject(new Error("Timed out waiting for the DSH client watcher initial build."))
		}, timeoutMs)
		const finish = (error) => {
			clearTimeout(timer)
			child.off("message", onMessage)
			child.off("error", onError)
			child.off("exit", onExit)
			if (error) reject(error)
			else resolve()
		}
		const onMessage = (message) => {
			if (message?.type === "ready") finish()
			if (message?.type === "error") finish(new Error(message.message))
		}
		const onError = (error) => finish(error)
		const onExit = (code, signal) =>
			finish(
				new Error(
					`DSH client watcher exited before readiness (code=${String(
						code,
					)}, signal=${String(signal)}).`,
				),
			)
		child.on("message", onMessage)
		child.once("error", onError)
		child.once("exit", onExit)
	})
}

function waitForChildExit(child) {
	if (!child || child.exitCode !== null) return Promise.resolve()
	return new Promise((resolve) => child.once("exit", resolve))
}
