import { spawn } from "node:child_process"
// Builds the native Update.exe invocation for Squirrel, so keep OS separators.
// eslint-disable-next-line no-restricted-imports
import path from "node:path"
import { app } from "electron"
import { TuiLauncher } from "../contexts/tui/infrastructure/tui-launcher"

export type SquirrelEvent = "install" | "updated" | "uninstall" | "firstrun" | "obsolete"

const EVENT_ARGS: Readonly<Record<string, SquirrelEvent>> = {
	"--squirrel-install": "install",
	"--squirrel-updated": "updated",
	"--squirrel-uninstall": "uninstall",
	"--squirrel-firstrun": "firstrun",
	"--squirrel-obsolete": "obsolete",
}

export function detectSquirrelEvent(argv = process.argv): SquirrelEvent | undefined {
	return EVENT_ARGS[argv[1]]
}

export async function handleSquirrelEvent(event: SquirrelEvent): Promise<void> {
	if (event === "obsolete") {
		app.quit()
		return
	}

	const launcher = new TuiLauncher()
	try {
		if (event === "uninstall") {
			await launcher.uninstallCommandLineTool()
		} else {
			await launcher.ensureCommandLineTool("installer")
		}
	} catch (error) {
		console.error(`[cocode] Squirrel ${event} CLI registration failed: ${errorMessage(error)}`)
	}

	try {
		if (event === "install" || event === "updated") {
			await runSquirrelShortcut("createShortcut")
		} else if (event === "uninstall") {
			await runSquirrelShortcut("removeShortcut")
		}
	} catch (error) {
		console.error(
			`[cocode] Squirrel ${event} shortcut operation failed: ${errorMessage(error)}`,
		)
	}
	app.quit()
}

function runSquirrelShortcut(operation: "createShortcut" | "removeShortcut"): Promise<void> {
	if (process.platform !== "win32") return Promise.resolve()
	const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe")
	const target = path.basename(process.execPath)
	return new Promise((resolve, reject) => {
		const child = spawn(updateExe, [`--${operation}=${target}`], { detached: true })
		child.once("error", reject)
		child.once("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`Update.exe exited with code ${String(code)}`)),
		)
	})
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
