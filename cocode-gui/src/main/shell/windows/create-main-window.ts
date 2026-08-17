import { BrowserWindow, shell } from "electron"
import path from "node:path"
import { registerDshWebSocketTransport } from "../security/register-dsh-websocket-transport"
import { resolveAppIcon } from "./app-icon"
import type { DesktopLogger } from "../../shared/logging/desktop-logger"

/**
 * Height of the shell's top chrome row, mirroring the renderer's
 * `--dsh-shell-header-height`. The session title is centered in it, and on
 * macOS the window controls join the same row, so this window has to know it.
 */
const SHELL_HEADER_ROW_PX = 46

/** Diameter of the macOS window-control buttons. */
const WINDOW_CONTROL_DIAMETER_PX = 14

/** AppKit's own left inset for the controls, kept so only their height moves. */
const WINDOW_CONTROL_INSET_X_PX = 9

export interface MainWindowOptions {
	readonly registerRuntimeOriginRebind?: (rebind: (origin: string) => void) => void
}

export const createMainWindow = (
	dshRuntimeUrl: string,
	logger?: DesktopLogger,
	options: MainWindowOptions = {},
): BrowserWindow => {
	// Windows/Linux take the frame icon from the window itself; macOS uses the Dock image.
	const windowIcon = process.platform === "darwin" ? undefined : resolveAppIcon()
	const mainWindow = new BrowserWindow({
		width: 1280,
		height: 840,
		minWidth: 960,
		minHeight: 640,
		...(windowIcon ? { icon: windowIcon } : {}),
		// macOS keeps the native traffic-light controls while removing the
		// separate title-bar/drag strip so the Renderer can own the full top edge.
		// AppKit centers those controls in a title bar of its own height, which is
		// shorter than the shell's row, so re-center them on the shell's row and
		// they line up with the session title beside them.
		...(process.platform === "darwin"
			? {
					titleBarStyle: "hidden" as const,
					trafficLightPosition: {
						x: WINDOW_CONTROL_INSET_X_PX,
						y: (SHELL_HEADER_ROW_PX - WINDOW_CONTROL_DIAMETER_PX) / 2,
					},
			  }
			: {}),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	})
	const unregisterDshWebSocketTransport = registerDshWebSocketTransport(
		mainWindow.webContents.session,
		new URL(dshRuntimeUrl).origin,
		MAIN_WINDOW_VITE_DEV_SERVER_URL
			? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
			: undefined,
	)
	options.registerRuntimeOriginRebind?.((origin) =>
		unregisterDshWebSocketTransport.updateRuntimeOrigin(origin),
	)

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		logger?.log("warn", "security.external-navigation", {
			audit: true,
			attributes: { url: safeUrl(url) },
		})
		if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url)
		return { action: "deny" }
	})
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (url === mainWindow.webContents.getURL()) return
		event.preventDefault()
		logger?.log("warn", "security.navigation-blocked", {
			audit: true,
			attributes: { url: safeUrl(url) },
		})
		if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url)
	})
	mainWindow.once("closed", unregisterDshWebSocketTransport.dispose)
	mainWindow.once("ready-to-show", () => {
		logger?.log("info", "window.ready-to-show", { attributes: { windowId: mainWindow.id } })
		mainWindow.show()
	})
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		void mainWindow
			.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
			.catch((error) => logger?.log("error", "window.load.failed", { error }))
	} else {
		void mainWindow
			.loadFile(path.join(__dirname, "../renderer", MAIN_WINDOW_VITE_NAME, "index.html"))
			.catch((error) => logger?.log("error", "window.load.failed", { error }))
	}
	return mainWindow
}

function safeUrl(value: string): string {
	try {
		const url = new URL(value)
		return `${url.origin}${url.pathname}`
	} catch {
		return "<invalid-url>"
	}
}
