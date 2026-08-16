/**
 * Process primitives shared by every dev runner.
 *
 * The single rule encoded here: a stop request always terminates. SIGTERM is
 * offered first so a child can flush its own state, but an unresponsive child
 * is escalated to SIGKILL rather than left to strand the runner that owns it.
 */
import { spawnSync } from "node:child_process"

const POLL_INTERVAL_MS = 100
/** Long enough for Electron and Vite to unwind, short enough to stay snappy. */
const DEFAULT_STOP_GRACE_MS = 8_000
const KILL_GRACE_MS = 2_000

export function isProcessAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		// EPERM means the process exists but is owned by somebody else.
		return error?.code === "EPERM"
	}
}

async function waitForProcessExit(pid, timeoutMs) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline && isProcessAlive(pid)) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
	}
	return !isProcessAlive(pid)
}

/** Returns `true` once the process is gone, whether it cooperated or not. */
export async function stopProcess(pid, { graceMs = DEFAULT_STOP_GRACE_MS } = {}) {
	if (!isProcessAlive(pid)) return true
	if (!signal(pid, "SIGTERM")) return true
	if (await waitForProcessExit(pid, graceMs)) return true
	signal(pid, "SIGKILL")
	return waitForProcessExit(pid, KILL_GRACE_MS)
}

/** Best-effort synchronous kill for paths that cannot await, such as a second Ctrl-C. */
export function killNow(pid) {
	signal(pid, "SIGKILL")
}

function signal(pid, name) {
	try {
		process.kill(pid, name)
		return true
	} catch (error) {
		// ESRCH means the process already exited, which is the outcome we wanted.
		if (error?.code === "ESRCH") return false
		throw error
	}
}

export function readProcessCommand(pid) {
	if (process.platform === "win32") return ""
	const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" })
	return result.stdout?.trim() ?? ""
}

function resolveProcessCwd(pid) {
	if (process.platform === "win32") return undefined
	const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
		encoding: "utf8",
	})
	return result.stdout
		?.split("\n")
		.find((line) => line.startsWith("n"))
		?.slice(1)
}

/** Every running process as `{ pid, command }`; empty where `ps` is unavailable. */
function listProcesses() {
	if (process.platform === "win32") return []
	const result = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
	const processes = []
	for (const line of result.stdout?.split("\n") ?? []) {
		const match = line.trim().match(/^(\d+)\s+(.+)$/)
		if (match) processes.push({ pid: Number(match[1]), command: match[2] })
	}
	return processes
}

/**
 * Stop processes this workspace previously started but no longer tracks, matched
 * by command and working directory so another checkout is never touched.
 */
export async function stopProcessesMatching({ matches, workspace, label }) {
	for (const { pid, command } of listProcesses()) {
		if (pid === process.pid || !matches(command)) continue
		if (resolveProcessCwd(pid) !== workspace) continue
		console.log(`[cocode] stopping ${label} (pid=${pid})`)
		if (!(await stopProcess(pid))) {
			throw new Error(`Cocode ${label} ${pid} did not stop.`)
		}
	}
}
