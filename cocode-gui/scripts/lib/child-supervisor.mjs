/**
 * Owns every child a dev runner spawns.
 *
 * Two guarantees matter here. A cooperative shutdown escalates SIGTERM to
 * SIGKILL so one wedged child cannot hold the runner open forever, and an
 * impatient second Ctrl-C still tears the tree down instead of killing the
 * runner and orphaning everything below it.
 */
import { killNow, stopProcess } from "./process-control.mjs"

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"]
const FORCED_EXIT_CODE = 130

export function createChildSupervisor({ graceMs, onForcedExit } = {}) {
	const children = new Map()
	let stopPromise = null
	let signalCount = 0

	const track = (child, label) => {
		children.set(child, label)
		child.once("exit", () => children.delete(child))
		return child
	}

	const running = () =>
		[...children.entries()].filter(
			([child]) =>
				child.pid !== undefined && child.exitCode === null && child.signalCode === null,
		)

	const stopAll = () => {
		if (stopPromise !== null) return stopPromise
		stopPromise = Promise.all(
			running().map(async ([child, label]) => {
				if (!(await stopProcess(child.pid, { graceMs }))) {
					console.warn(`[cocode] ${label} (pid=${child.pid}) did not stop.`)
				}
			}),
		).then(() => undefined)
		return stopPromise
	}

	for (const name of SHUTDOWN_SIGNALS) {
		process.on(name, () => {
			signalCount += 1
			if (signalCount === 1) {
				void stopAll()
				return
			}
			console.warn("[cocode] forcing shutdown")
			for (const [child] of running()) killNow(child.pid)
			onForcedExit?.()
			process.exit(FORCED_EXIT_CODE)
		})
	}

	return { track, stopAll, isStopping: () => stopPromise !== null }
}
