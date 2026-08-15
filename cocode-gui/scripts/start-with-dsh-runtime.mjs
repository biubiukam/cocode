import { fork, spawn, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const configuredRuntimeRoot = process.env.DSH_RUNTIME_ROOT
const runtimeRoot = configuredRuntimeRoot ?? mkdtempSync(path.join(os.tmpdir(), "dsh-desktop-dev-"))
const stageScript = path.resolve("scripts/stage-dsh-runtime.mjs")
const clientWatcherScript = path.resolve("scripts/watch-dsh-client.mjs")
let clientWatcher
let electron
let stopping = false

try {
	if (!configuredRuntimeRoot) {
		const staged = spawnSync(process.execPath, [stageScript, "--destination", runtimeRoot], {
			stdio: "inherit",
			cwd: process.cwd(),
			env: process.env,
		})
		if (staged.error) throw staged.error
		if (staged.status !== 0) {
			throw new Error(`DSH runtime staging failed with code ${String(staged.status)}.`)
		}
	}

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
	if (!configuredRuntimeRoot) rmSync(runtimeRoot, { recursive: true, force: true })
}

function waitForClientWatcher(child) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("Timed out waiting for the DSH client watcher initial build."))
		}, 60_000)
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
