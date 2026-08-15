import { BrowserWindow, shell } from "electron"
import path from "node:path"
import { registerDshWebSocketTransport } from "../security/register-dsh-websocket-transport"

export const createMainWindow = (dshRuntimeUrl: string): BrowserWindow => {
	const mainWindow = new BrowserWindow({
		width: 1280,
		height: 840,
		minWidth: 960,
		minHeight: 640,
		// macOS keeps the native traffic-light controls while removing the
		// separate title-bar/drag strip so the Renderer can own the full top edge.
		...(process.platform === "darwin" ? { titleBarStyle: "hidden" as const } : {}),
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

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url)
		return { action: "deny" }
	})
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (url === mainWindow.webContents.getURL()) return
		event.preventDefault()
		if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url)
	})
	mainWindow.once("closed", unregisterDshWebSocketTransport)
	mainWindow.once("ready-to-show", () => mainWindow.show())
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
	} else {
		void mainWindow.loadFile(
			path.join(__dirname, "../renderer", MAIN_WINDOW_VITE_NAME, "index.html"),
		)
	}
	return mainWindow
}
