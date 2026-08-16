/**
 * One dev runner per workspace.
 *
 * The lock is taken before the first build step rather than just before the
 * first spawn. Two concurrent `pnpm run dev` invocations otherwise race inside
 * `packages/cocode/*\/lib`, and the loser fails with a missing runtime plugin
 * because the winner truncated the file it was about to read.
 */
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import {
	isProcessAlive,
	readProcessCommand,
	stopProcess,
	stopProcessesMatching,
} from "./process-control.mjs"

export async function acquireDevLock({ name, entryScript }) {
	const workspace = path.resolve(process.cwd())
	const lockPath = resolveLockPath(name, workspace)
	mkdirSync(path.dirname(lockPath), { recursive: true })

	for (let attempt = 0; attempt < 2; attempt += 1) {
		const lock = tryWriteLock(lockPath, workspace)
		if (lock !== undefined) {
			// Runners killed with SIGKILL leave no lock behind, so sweep for
			// same-workspace strays only after this process owns the lock.
			await stopProcessesMatching({
				matches: (command) => command.includes(entryScript),
				workspace,
				label: "legacy dev instance",
			})
			return lock
		}
		await displacePreviousRunner(lockPath, entryScript)
	}
	throw new Error(`Unable to acquire the Cocode dev lock at ${lockPath}.`)
}

function tryWriteLock(lockPath, workspace) {
	let descriptor
	try {
		descriptor = openSync(lockPath, "wx")
	} catch (error) {
		if (error?.code === "EEXIST") return undefined
		throw error
	}
	try {
		writeFileSync(descriptor, `${process.pid}\n${workspace}\n`)
	} finally {
		closeSync(descriptor)
	}
	return installRelease(lockPath)
}

async function displacePreviousRunner(lockPath, entryScript) {
	const previous = readLock(lockPath)
	if (previous === undefined || !isProcessAlive(previous.pid)) {
		rmSync(lockPath, { force: true })
		return
	}
	if (!readProcessCommand(previous.pid).includes(entryScript)) {
		throw new Error(`Cocode dev lock is held by an unrelated process (pid=${previous.pid}).`)
	}
	console.log(`[cocode] stopping previous dev instance (pid=${previous.pid})`)
	if (!(await stopProcess(previous.pid))) {
		throw new Error(`Cocode dev process ${previous.pid} did not stop.`)
	}
	rmSync(lockPath, { force: true })
}

/**
 * `exit` fires for normal completion, thrown errors and any signal the runner
 * turns into a graceful shutdown, so the lock outlives the runner only when the
 * runner itself was SIGKILLed — which the stale-lock check above then heals.
 */
function installRelease(lockPath) {
	const owner = process.pid
	let released = false
	const release = () => {
		if (released) return
		released = true
		if (readLock(lockPath)?.pid === owner) rmSync(lockPath, { force: true })
	}
	process.on("exit", release)
	return { release }
}

function readLock(lockPath) {
	try {
		const [pid] = readFileSync(lockPath, "utf8")
			.trim()
			.split(/\s*\n\s*/)
		return Number.isInteger(Number(pid)) && Number(pid) > 0 ? { pid: Number(pid) } : undefined
	} catch {
		return undefined
	}
}

function resolveLockPath(name, workspace) {
	const key = createHash("sha256").update(workspace).digest("hex").slice(0, 16)
	const root = process.env.XDG_RUNTIME_DIR ?? os.tmpdir()
	return path.join(root, `${name}-${key}.lock`)
}
