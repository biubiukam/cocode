#!/usr/bin/env node

/**
 * Reconcile processes left by older Cocode desktop acceptance runners.
 *
 * The default is report-only. `--apply` is required before sending signals,
 * and the matcher is intentionally narrow: a reparented `cocode` process,
 * an acceptance scratch root, and the daemon entrypoint must all be present.
 * This is a migration/diagnostic tool, not a broad process killer.
 */
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const result = await reconcile({ apply: process.argv.includes("--apply") })
	process.exitCode = result.failed
}

export async function reconcile({ apply = false } = {}) {
	const candidates = listProcesses().filter(isOwnedLegacyDaemon)
	for (const processInfo of candidates)
		console.log(
			`${apply ? "reaping" : "candidate"} pid=${processInfo.pid} ${processInfo.command}`,
		)
	if (!apply) {
		if (candidates.length === 0) console.log("No legacy Cocode daemon candidates found.")
		return { candidates: candidates.length, failed: 0 }
	}
	let failed = 0
	const queue = [...candidates]
	const workers = Array.from({ length: Math.min(32, queue.length) }, async () => {
		while (queue.length > 0) {
			const processInfo = queue.pop()
			if (processInfo === undefined) return
			if (!signal(processInfo.pid, "SIGTERM")) continue
			if (await waitForExit(processInfo.pid, 8_000)) continue
			signal(processInfo.pid, "SIGKILL")
			if (!(await waitForExit(processInfo.pid, 2_000))) {
				console.error(`failed to reap legacy Cocode daemon pid=${processInfo.pid}`)
				failed = 1
			}
		}
	})
	await Promise.all(workers)
	if (candidates.length === 0) console.log("No legacy Cocode daemon candidates found.")
	return { candidates: candidates.length, failed }
}

function isOwnedLegacyDaemon(processInfo) {
	const command = processInfo.command
	const acceptanceDaemon =
		processInfo.ppid === 1 &&
		command.includes("cocode-desktop-acceptance-") &&
		command.includes(" daemon start") &&
		command.includes("--computer-host-bootstrap-stdin") &&
		/(^|\/)cocode(\s|$)/.test(command)
	const oldRuntimeDaemon =
		processInfo.ppid === 1 &&
		command.includes("/clients/app/.runtime/cocode") &&
		command.includes(" daemon start") &&
		(command.includes("/private/tmp/cocode-") || command.includes("@cocode/desktop/"))
	return acceptanceDaemon || oldRuntimeDaemon
}

function listProcesses() {
	if (process.platform === "win32") return []
	const result = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
	if (result.status !== 0) return []
	const rows = []
	for (const line of result.stdout.split("\n")) {
		const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
		if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] })
	}
	return rows
}

function signal(pid, name) {
	try {
		process.kill(pid, name)
		return true
	} catch (error) {
		return error?.code !== "ESRCH"
	}
}

async function waitForExit(pid, timeoutMs) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isAlive(pid)) return true
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	return !isAlive(pid)
}

function isAlive(pid) {
	try {
		process.kill(pid, 0)
		const state = spawnSync("ps", ["-o", "state=", "-p", String(pid)], { encoding: "utf8" })
		return !state.stdout.trim().startsWith("Z")
	} catch {
		return false
	}
}
