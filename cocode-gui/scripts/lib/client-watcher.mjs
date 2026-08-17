/**
 * The tsdown + chokidar watcher that rebuilds DSH client packages on change.
 *
 * The child is handed back before it is ready so the caller can register it for
 * teardown first: a Ctrl-C during the initial build must still stop the watcher.
 */
import { fork } from "node:child_process"
import path from "node:path"

const DEFAULT_READY_TIMEOUT_MS = 300_000

export function forkClientWatcher(runtimeRoot) {
	const child = fork(
		path.resolve("scripts/watch-dsh-client.mjs"),
		["--runtime-root", runtimeRoot],
		{
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			cwd: process.cwd(),
			env: process.env,
			execArgv: ["--import", "tsx/esm"],
		},
	)
	return { child, ready: waitForReady(child) }
}

function waitForReady(child) {
	return new Promise((resolve, reject) => {
		let timer
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

		const timeoutMs = Number(
			process.env.DSH_CLIENT_WATCH_TIMEOUT_MS ?? DEFAULT_READY_TIMEOUT_MS,
		)
		timer = setTimeout(
			() => finish(new Error("Timed out waiting for the DSH client watcher initial build.")),
			timeoutMs,
		)
		child.on("message", onMessage)
		child.once("error", onError)
		child.once("exit", onExit)
	})
}
