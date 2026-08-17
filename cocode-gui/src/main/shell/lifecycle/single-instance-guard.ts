import { app } from "electron"

/**
 * Electron keys the lock on the `userData` directory, so a development run and
 * an installed build of the same app compete for the same lock. The escape
 * hatch keeps both runnable side by side while debugging.
 */
const isMultipleInstancesAllowed = (): boolean =>
	process.env.COCODE_ALLOW_MULTIPLE_INSTANCES?.trim() === "1"

/**
 * Claims the desktop-wide single-instance lock. A losing instance MUST return
 * from bootstrap immediately: the Host lease, the SQLite files and the rotating
 * log sink all assume a single owner, so any work done before quitting would
 * corrupt state that the running instance still holds.
 */
export const acquireSingleInstanceLock = (): boolean => {
	if (isMultipleInstancesAllowed()) return true
	if (app.requestSingleInstanceLock()) return true
	app.quit()
	return false
}
