/**
 * Browser dev runner: DSH client watcher + Vite against a shared DSH Host.
 *
 * Unlike the desktop runner there is no Electron to hold the Host lease, so this
 * script acquires one itself and releases it during teardown; the Host then
 * idles out on its own if nothing else is attached.
 */
import { spawn } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { createChildSupervisor } from "./lib/child-supervisor.mjs"
import { forkClientWatcher } from "./lib/client-watcher.mjs"
import { buildDevRuntime } from "./lib/dev-build.mjs"
import { acquireDevLock } from "./lib/dev-lock.mjs"
import { cleanupRuntime, prepareRuntime, resolveRuntimeRoot } from "./lib/runtime-cache.mjs"

const ENTRY_SCRIPT = "start-web-dev.mjs"
const ABORTED_EXIT_CODE = 130
const VITE_PORT = "5273"

const workspace = path.resolve(process.cwd())
const supervisorEntry = path.resolve(
	"../cocode-host-supervisor/packages/host-supervisor/lib/bin.js",
)
const runtime = resolveRuntimeRoot("dsh-web-dev-")
const children = createChildSupervisor()
const devLock = await acquireDevLock({ name: "cocode-gui-web", entryScript: ENTRY_SCRIPT })
let hostLease

try {
	process.exitCode = await run()
} finally {
	await children.stopAll()
	await hostLease?.release().catch(() => undefined)
	cleanupRuntime(runtime)
	devLock.release()
}

async function run() {
	buildDevRuntime()
	prepareRuntime(runtime)
	if (children.isStopping()) return ABORTED_EXIT_CODE

	const watcher = forkClientWatcher(runtime.root)
	children.track(watcher.child, "DSH client watcher")
	await watcher.ready
	if (children.isStopping()) return ABORTED_EXIT_CODE

	const runtimeUrl = await acquireHostEndpoint()

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

	const exitCode = await waitForExit(startVite(runtimeUrl))
	if (watcherFailure) throw watcherFailure
	return exitCode
}

async function acquireHostEndpoint() {
	const { createHostSupervisorClient, resolveHostRuntimeEnv, resolveHostScope } = await import(
		"@cocode/host-supervisor"
	)
	const lease = await createHostSupervisorClient({
		nodeExecutable: process.execPath,
		serviceEntry: supervisorEntry,
	}).acquire({
		scope: resolveHostScope({ ...process.env, DSH_HOME: resolveDshHome() }),
		clientKind: "gui",
		requiredServices: ["web"],
		minProtocolRevision: "1.0",
		runtimeEnv: resolveHostRuntimeEnv(process.env),
	})
	hostLease = lease
	const web = lease.descriptor.services.find((service) => service.service === "web")
	if (web === undefined) throw new Error("shared Host did not advertise its Web service")
	console.log(`[dsh-runtime] web endpoint ${web.endpoint}`)
	return web.endpoint.replace(/\/$/, "")
}

function startVite(runtimeUrl) {
	return children.track(
		spawn(
			"pnpm",
			["exec", "vite", "--config", "vite.renderer.config.ts", "--port", VITE_PORT],
			{
				stdio: "inherit",
				cwd: workspace,
				env: {
					...process.env,
					DSH_RUNTIME_ROOT: runtime.root,
					COCODE_DSH_RUNTIME_URL: runtimeUrl,
					COCODE_SUPERVISOR_SERVICE_ENTRY: supervisorEntry,
					COCODE_NODE_EXECUTABLE: process.execPath,
				},
			},
		),
		"Vite",
	)
}

function resolveDshHome() {
	const configured = process.env.DSH_HOME?.trim()
	const selected =
		configured !== undefined && configured.length > 0
			? configured
			: path.join(os.homedir(), ".dsh")
	if (selected === "~") return os.homedir()
	if (selected.startsWith("~/") || selected.startsWith("~\\")) {
		return path.resolve(path.join(os.homedir(), selected.slice(2)))
	}
	return path.resolve(selected)
}

function waitForExit(child) {
	return new Promise((resolve, reject) => {
		child.once("error", reject)
		child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)))
	})
}
