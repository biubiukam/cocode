import { app, BrowserWindow, type BrowserWindowConstructorOptions } from "electron"
import { existsSync } from "node:fs"
import * as path from "pathe"
import { startupFailurePhaseLabel, type StartupFailureRecord } from "../lifecycle/startup-failure"
import { resolveElectronPreloadPath } from "./electron-resource-paths"
import type { DesktopLogger } from "../../shared/logging/desktop-logger"

export interface StartupFailureWindowOptions {
	readonly failure: StartupFailureRecord
	readonly logger?: DesktopLogger
	readonly onLoadFailure?: (error: unknown) => void
}

export interface StartupFailureWindowQuery {
	readonly phase: string
	readonly phaseLabel: string
	readonly failureCode: string
	readonly userMessage: string
	readonly version: string
	readonly platform: string
	readonly architecture: string
	readonly logRoot: string
}

export function createStartupFailureWindowQuery(
	failure: StartupFailureRecord,
	runtime: Pick<StartupFailureWindowQuery, "version" | "platform" | "architecture" | "logRoot">,
): Record<string, string> {
	return {
		phase: failure.phase,
		phaseLabel: startupFailurePhaseLabel(failure.phase),
		failureCode: failure.failureCode,
		userMessage: failure.userMessage,
		...runtime,
	}
}

export function createStartupFailureWindow({
	failure,
	logger,
	onLoadFailure,
}: StartupFailureWindowOptions): BrowserWindow {
	const window = new BrowserWindow({
		width: 620,
		height: 520,
		minWidth: 520,
		minHeight: 420,
		show: false,
		resizable: false,
		webPreferences: {
			preload: resolveElectronPreloadPath(app.getAppPath()),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	} satisfies BrowserWindowConstructorOptions)

	const query = createStartupFailureWindowQuery(failure, {
		version: app.getVersion(),
		platform: process.platform,
		architecture: process.arch,
		logRoot: resolveLogRootDisplay(),
	})
	window.once("ready-to-show", () => {
		logger?.log("info", "startup.failure-window.shown", {
			attributes: { phase: failure.phase, failureCode: failure.failureCode },
		})
		window.show()
	})
	window.once("closed", () => logger?.log("info", "startup.failure-window.closed"))
	let htmlPath: string
	try {
		htmlPath = resolveStartupFailureHtmlPath()
	} catch (error) {
		if (!window.isDestroyed()) window.close()
		throw error
	}
	void window.loadFile(htmlPath, { query }).catch((error: unknown) => {
		logger?.log("fatal", "startup.failure-window.load.failed", { error })
		onLoadFailure?.(error)
		if (!window.isDestroyed()) window.close()
	})
	return window
}

export function resolveStartupFailureHtmlPath(
	appPath = app.getAppPath(),
	resourcesPath = process.resourcesPath,
): string {
	const candidates = [
		path.join(resourcesPath, "startup-failure.html"),
		path.join(appPath, "resources", "startup-failure.html"),
		path.join(resourcesPath, "app", "resources", "startup-failure.html"),
		path.join(resourcesPath, "resources", "startup-failure.html"),
	]
	const resolved = candidates.find((candidate) => existsSync(candidate))
	if (!resolved) throw new Error("Startup failure diagnostic page is missing from the package.")
	return resolved
}

function resolveLogRootDisplay(): string {
	if (process.platform === "win32") return "%LOCALAPPDATA%\\Cocode\\Logs"
	if (process.platform === "darwin") return "~/Library/Logs/Cocode"
	return "~/.local/state/cocode/logs"
}
