import { app, BrowserWindow } from "electron"
import { ApplicationQuitCoordinator } from "./application-quit-coordinator"
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
}: ApplicationLifecycleOptions): ApplicationLifecycleController => {
	const quitCoordinator = new ApplicationQuitCoordinator()
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
		const decision = quitCoordinator.handleQuitAttempt()
		if (decision === "allow") return
		event.preventDefault()
		if (decision === "prevent") return
		void Promise.resolve(onBeforeQuit?.()).then(
			() => {
				const completeQuit = quitCoordinator.complete(() => app.quit())
				try {
					completeQuit()
				} catch (error) {
					console.error("Failed to finish quitting the desktop application:", error)
					app.exit(1)
				}
			},
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

	return {
		requestQuitForUpdate: (installUpdate) => {
			if (!quitCoordinator.requestCompletion(installUpdate)) return false
			app.quit()
			return true
		},
	}
}

export interface ApplicationLifecycleController {
	readonly requestQuitForUpdate: (installUpdate: () => void) => boolean
}
