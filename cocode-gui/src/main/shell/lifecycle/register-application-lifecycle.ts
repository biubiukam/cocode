import { app, BrowserWindow } from "electron"
import type { DesktopLogger } from "../../shared/logging/desktop-logger"

export interface ApplicationLifecycleOptions {
	readonly createWindow: () => void
	readonly onReady?: () => void | Promise<void>
	readonly onBeforeQuit?: () => void | Promise<void>
	readonly logger?: DesktopLogger
}

export const registerApplicationLifecycle = ({
	createWindow,
	onReady,
	onBeforeQuit,
	logger,
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
				logger?.log("fatal", "app.ready.failed", { error })
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
				logger?.log("fatal", "app.shutdown.failed", { error })
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
