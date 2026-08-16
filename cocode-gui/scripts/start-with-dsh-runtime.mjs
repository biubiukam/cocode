import { fork, spawn, spawnSync } from "node:child_process"
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	closeSync,
	writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
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
const devLockPath = resolveDevLockPath()
// Benign macOS IMK / Chromium stderr noise; see electron/electron#45002.
const BENIGN_MACOS_STDERR_PATTERNS = [
	/error messaging the mach port for IMKCFRunLoopWakeUpReliable/,
	/\+\[IMKClient subclass\]: chose IMKClient_Modern/,
	/\+\[IMKInputSession subclass\]: chose IMKInputSession_Modern/,
]
let clientWatcher
let electron
let stopping = false
let devLock

try {
	devLock = await acquireDevLock(devLockPath)
	await stopLegacyDevProcesses()
	await stopOrphanedElectronProcesses()
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
		stdio: ["inherit", "inherit", process.platform === "darwin" ? "pipe" : "inherit"],
		cwd: process.cwd(),
		env: { ...process.env, DSH_RUNTIME_ROOT: runtimeRoot },
	})
	if (process.platform === "darwin" && electron.stderr) {
		electron.stderr.on("data", (chunk) => {
			if (isBenignMacOsStderr(chunk)) return
			process.stderr.write(chunk)
		})
	}

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
	releaseDevLock(devLockPath, devLock)
}

function isBenignMacOsStderr(chunk) {
	const text = chunk.toString()
	return BENIGN_MACOS_STDERR_PATTERNS.some((pattern) => pattern.test(text))
}

function resolveDevLockPath() {
	const key = createHash("sha256").update(path.resolve(process.cwd())).digest("hex").slice(0, 16)
	const root = process.env.XDG_RUNTIME_DIR ?? os.tmpdir()
	return path.join(root, `cocode-gui-${key}.lock`)
}

async function acquireDevLock(lockPath) {
	mkdirSync(path.dirname(lockPath), { recursive: true })
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const fd = openSync(lockPath, "wx")
			writeFileSync(fd, `${process.pid}\n${path.resolve(process.cwd())}\n`)
			closeSync(fd)
			return { pid: process.pid }
		} catch (error) {
			if (error?.code !== "EEXIST") throw error
			const previous = readLock(lockPath)
			if (!previous || !isProcessAlive(previous.pid)) {
				rmSync(lockPath, { force: true })
				continue
			}
			if (!isCocodeDevProcess(previous.pid)) {
				throw new Error(
					`Cocode GUI lock is held by an unrelated process (pid=${previous.pid}).`,
				)
			}
			console.log(`[cocode] stopping previous GUI dev instance (pid=${previous.pid})`)
			await stopProcess(previous.pid)
			rmSync(lockPath, { force: true })
		}
	}
	throw new Error(`Unable to acquire Cocode GUI dev lock at ${lockPath}.`)
}

function readLock(lockPath) {
	try {
		const [pidText, cwd] = readFileSync(lockPath, "utf8")
			.trim()
			.split(/\s*\n\s*/)
		const pid = Number(pidText)
		return Number.isInteger(pid) && pid > 0 ? { pid, cwd } : undefined
	} catch {
		return undefined
	}
}

function isProcessAlive(pid) {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error?.code === "EPERM"
	}
}

function isCocodeDevProcess(pid) {
	const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" })
	const command = result.stdout?.trim() ?? ""
	return command.includes("start-with-dsh-runtime.mjs")
}

async function stopLegacyDevProcesses() {
	if (process.platform === "win32") return
	const result = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
	for (const line of result.stdout?.split("\n") ?? []) {
		const match = line.trim().match(/^(\d+)\s+(.+)$/)
		if (!match) continue
		const pid = Number(match[1])
		if (pid === process.pid || !match[2].includes("start-with-dsh-runtime.mjs")) continue
		if (resolveProcessCwd(pid) !== path.resolve(process.cwd())) continue
		console.log(`[cocode] stopping legacy GUI dev instance (pid=${pid})`)
		await stopProcess(pid, true)
	}
}

async function stopOrphanedElectronProcesses() {
	if (process.platform === "win32") return
	const executable = path.join(
		path.resolve(process.cwd()),
		"node_modules",
		"electron",
		"dist",
		"Electron.app",
		"Contents",
		"MacOS",
		"Electron",
	)
	const result = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
	for (const line of result.stdout?.split("\n") ?? []) {
		const match = line.trim().match(/^(\d+)\s+(.+)$/)
		if (!match || !match[2].startsWith(`${executable} `)) continue
		const pid = Number(match[1])
		if (resolveProcessCwd(pid) !== path.resolve(process.cwd())) continue
		console.log(`[cocode] stopping orphaned Electron instance (pid=${pid})`)
		await stopProcess(pid)
	}
}

function resolveProcessCwd(pid) {
	const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
		encoding: "utf8",
	})
	const pathname = result.stdout?.split("\n").find((line) => line.startsWith("n"))
	return pathname?.slice(1)
}

async function stopProcess(pid, force = false) {
	try {
		process.kill(pid, "SIGTERM")
	} catch (error) {
		if (error?.code === "ESRCH") return
		throw error
	}
	await waitForProcessExit(pid, 8_000)
	if (force && isProcessAlive(pid)) {
		process.kill(pid, "SIGKILL")
		await waitForProcessExit(pid, 2_000)
	}
	if (isProcessAlive(pid)) throw new Error(`Cocode GUI dev process ${pid} did not stop.`)
}

async function waitForProcessExit(pid, timeoutMs) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline && isProcessAlive(pid)) {
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
}

function releaseDevLock(lockPath, lock) {
	if (!lock || lock.pid !== process.pid) return
	const current = readLock(lockPath)
	if (current?.pid === process.pid) rmSync(lockPath, { force: true })
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
				fileSignature(path.join(pluginRoot, "lib", "index.js")),
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
