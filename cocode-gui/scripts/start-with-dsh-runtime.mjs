/**
 * Desktop dev runner: DSH client watcher + Electron Forge, under one dev lock.
 *
 * The lock is taken first, before any build, so a second `pnpm run dev` in this
 * workspace displaces this one instead of racing it. Everything spawned here is
 * registered with the child supervisor, which guarantees teardown on exit.
 */
import { spawn } from "node:child_process"
import path from "node:path"
import { createChildSupervisor } from "./lib/child-supervisor.mjs"
import { forkClientWatcher } from "./lib/client-watcher.mjs"
import { buildDevRuntime } from "./lib/dev-build.mjs"
import { acquireDevLock } from "./lib/dev-lock.mjs"
import { stopProcessesMatching } from "./lib/process-control.mjs"
import { cleanupRuntime, prepareRuntime, resolveRuntimeRoot } from "./lib/runtime-cache.mjs"

const ENTRY_SCRIPT = "start-with-dsh-runtime.mjs"
const ABORTED_EXIT_CODE = 130
// Benign macOS IMK / Chromium stderr noise; see electron/electron#45002.
const BENIGN_MACOS_STDERR_PATTERNS = [
	/error messaging the mach port for IMKCFRunLoopWakeUpReliable/,
	/\+\[IMKClient subclass\]: chose IMKClient_Modern/,
	/\+\[IMKInputSession subclass\]: chose IMKInputSession_Modern/,
]

const workspace = path.resolve(process.cwd())
const supervisorEntry = path.resolve(
	"../cocode-host-supervisor/packages/host-supervisor/lib/bin.js",
)
const runtime = resolveRuntimeRoot("dsh-desktop-dev-")
const children = createChildSupervisor()
const devLock = await acquireDevLock({ name: "cocode-gui", entryScript: ENTRY_SCRIPT })

try {
	process.exitCode = await run()
} finally {
	await children.stopAll()
	// Electron is a grandchild through Forge and can outlive it, so sweep the
	// workspace once more before releasing the lock to the next runner.
	await stopStrayElectron()
	cleanupRuntime(runtime)
	devLock.release()
}

async function run() {
	await stopStrayElectron()
	buildDevRuntime({ hardenElectron: true })
	prepareRuntime(runtime)
	if (children.isStopping()) return ABORTED_EXIT_CODE

	const watcher = forkClientWatcher(runtime.root)
	children.track(watcher.child, "DSH client watcher")
	await watcher.ready
	if (children.isStopping()) return ABORTED_EXIT_CODE

	let watcherFailure
	watcher.child.once("exit", (code, signal) => {
		if (children.isStopping()) return
		watcherFailure = new Error(
			`DSH client watcher exited unexpectedly (code=${String(code)}, signal=${String(
				signal,
			)}).`,
		)
		void children.stopAll()
	})

	const exitCode = await waitForExit(startElectron())
	if (watcherFailure) throw watcherFailure
	return exitCode
}

function startElectron() {
	const electron = children.track(
		spawn("pnpm", ["exec", "electron-forge", "start"], {
			stdio: ["inherit", "inherit", process.platform === "darwin" ? "pipe" : "inherit"],
			cwd: workspace,
			env: {
				...process.env,
				DSH_RUNTIME_ROOT: runtime.root,
				COCODE_SUPERVISOR_SERVICE_ENTRY: supervisorEntry,
				COCODE_NODE_EXECUTABLE: process.execPath,
			},
		}),
		"Electron",
	)
	electron.stderr?.on("data", (chunk) => {
		if (BENIGN_MACOS_STDERR_PATTERNS.some((pattern) => pattern.test(chunk.toString()))) return
		process.stderr.write(chunk)
	})
	return electron
}

function stopStrayElectron() {
	const executable =
		process.platform === "darwin"
			? path.join(
					workspace,
					"node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
			  )
			: path.join(workspace, "node_modules/electron/dist/electron")
	return stopProcessesMatching({
		matches: (command) => command.startsWith(`${executable} `),
		workspace,
		label: "orphaned Electron instance",
	})
}

function waitForExit(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject)
		child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)))
	})
}
