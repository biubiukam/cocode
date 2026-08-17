/**
 * One dev runner per workspace, newest wins.
 *
 * The lock is taken before the first build step rather than just before the
 * first spawn. Two concurrent `pnpm run dev` invocations otherwise race inside
 * `packages/cocode/*\/lib`, and the loser fails with a missing runtime plugin
 * because the winner truncated the file it was about to read.
 *
 * The lock file is the only authority on who owns the workspace. Nothing here
 * stops a runner it did not read out of that file: a sweep by command name
 * cannot tell a stale runner from one that is starting up right now, so two
 * simultaneous starts would shoot each other and leave nothing running.
 */
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import os from "node:os"
import * as path from "pathe"
import { isProcessAlive, readProcessCommand, stopProcess } from "./process-control.mjs"

/** Each attempt either wins the lock or displaces one distinct holder. */
const MAX_ATTEMPTS = 5

export async function acquireDevLock({ name, entryScript }) {
	const workspace = path.resolve(process.cwd())
	const lockPath = resolveLockPath(name, workspace)
	mkdirSync(path.dirname(lockPath), { recursive: true })

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const lock = tryWriteLock(lockPath, workspace)
		if (lock !== undefined) return lock
		await displaceHolder(lockPath, entryScript)
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

async function displaceHolder(lockPath, entryScript) {
	const holder = readLock(lockPath)
	if (holder === undefined) return
	if (isProcessAlive(holder.pid)) {
		if (!readProcessCommand(holder.pid).includes(entryScript)) {
			throw new Error(`Cocode dev lock is held by an unrelated process (pid=${holder.pid}).`)
		}
		console.log(`[cocode] stopping previous dev instance (pid=${holder.pid})`)
		if (!(await stopProcess(holder.pid))) {
			throw new Error(`Cocode dev process ${holder.pid} did not stop.`)
		}
	}
	clearLockOwnedBy(lockPath, holder.pid)
}

/**
 * Compare before deleting: another starter may have taken ownership while this
 * one was stopping the holder, and clearing its lock would let both run.
 */
function clearLockOwnedBy(lockPath, pid) {
	if (readLock(lockPath)?.pid === pid) rmSync(lockPath, { force: true })
}

/**
 * `exit` fires for normal completion, thrown errors and any signal the runner
 * turns into a graceful shutdown, so the lock outlives the runner only when the
 * runner itself was SIGKILLed — which the dead-holder check above then heals.
 */
function installRelease(lockPath) {
	const owner = process.pid
	let released = false
	const release = () => {
		if (released) return
		released = true
		clearLockOwnedBy(lockPath, owner)
	}
	process.on("exit", release)
	return { release }
}

function readLock(lockPath) {
	try {
		const pid = Number(
			readFileSync(lockPath, "utf8")
				.trim()
				.split(/\s*\n\s*/)[0],
		)
		return Number.isInteger(pid) && pid > 0 ? { pid } : undefined
	} catch {
		return undefined
	}
}

function resolveLockPath(name, workspace) {
	const key = createHash("sha256").update(workspace).digest("hex").slice(0, 16)
	const root = process.env.XDG_RUNTIME_DIR ?? os.tmpdir()
	return path.join(root, `${name}-${key}.lock`)
}
