import { app, BrowserWindow } from "electron"

export interface ApplicationLifecycleOptions {
	readonly createWindow: () => void
	readonly onReady?: () => void | Promise<void>
	readonly onBeforeQuit?: () => void | Promise<void>
}

export const registerApplicationLifecycle = ({
	createWindow,
	onReady,
	onBeforeQuit,
}: ApplicationLifecycleOptions): void => {
	let quitting = false
	let applicationReady = false

	app.on("ready", () => {
		void (async () => {
			try {
				await onReady?.()
				applicationReady = true
				createWindow()
			} catch (error) {
				console.error("Failed to start the desktop application:", error)
				app.quit()
			}
		})()
	})

	app.on("before-quit", (event) => {
		if (quitting) return
		quitting = true
		event.preventDefault()
		void Promise.resolve(onBeforeQuit?.()).then(
			() => app.quit(),
			(error) => {
				console.error("Failed to stop the desktop application cleanly:", error)
				app.exit(1)
			},
		)
	})

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit()
		}
	})

	app.on("activate", () => {
		if (applicationReady && BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		}
	})
}
