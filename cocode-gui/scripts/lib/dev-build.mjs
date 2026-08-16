/**
 * Build steps a dev runner needs before it can spawn anything.
 *
 * These used to be `predev`/`prestart` lifecycle scripts, which ran before the
 * dev lock existed and let two concurrent runs overwrite each other's plugin
 * output. Running them from inside the lock makes concurrent starts serialize.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"

export function buildDevRuntime({ hardenElectron = false } = {}) {
	if (hardenElectron) runScript("scripts/harden-electron-default-app.mjs")
	runScript("scripts/cocode-plugins.mjs", ["build"])
	runScript("scripts/build-supervisor.mjs")
}

function runScript(relativePath, args = []) {
	const result = spawnSync(process.execPath, [path.resolve(relativePath), ...args], {
		stdio: "inherit",
		cwd: process.cwd(),
		env: process.env,
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(`${relativePath} failed with exit code ${String(result.status)}.`)
	}
}
