import { app, BrowserWindow } from "electron"
import { ApplicationQuitCoordinator } from "./application-quit-coordinator"
import type { DesktopLogger } from "../../shared/logging/desktop-logger"

export interface ApplicationLifecycleOptions {
	readonly createWindow: () => void
	readonly onReady?: () => void | Promise<void>
	readonly onBeforeQuit?: () => void | Promise<void>
	readonly logger?: DesktopLogger
}

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"]
/** Bounds shutdown so a stuck teardown step cannot keep the Host lease alive. */
const SHUTDOWN_TIMEOUT_MS = 10_000

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
		const watchdog = setTimeout(() => {
			logger?.log("fatal", "app.shutdown.timeout", {
				attributes: { timeoutMs: SHUTDOWN_TIMEOUT_MS },
			})
			app.exit(1)
		}, SHUTDOWN_TIMEOUT_MS)
		watchdog.unref()
		void Promise.resolve(onBeforeQuit?.()).then(
			() => {
				clearTimeout(watchdog)
				const completeQuit = quitCoordinator.complete(() => app.quit())
				try {
					completeQuit()
				} catch (error) {
					console.error("Failed to finish quitting the desktop application:", error)
					app.exit(1)
				}
			},
			(error) => {
				clearTimeout(watchdog)
				logger?.log("fatal", "app.shutdown.failed", { error })
				app.exit(1)
			},
		)
	})

	// Electron installs no handler for POSIX shutdown signals, so a dev runner or
	// a supervisor stopping the app would bypass `before-quit` entirely and leave
	// the Host lease and the SQLite handle to be reclaimed by timeout instead.
	for (const signal of SHUTDOWN_SIGNALS) {
		process.on(signal, () => {
			logger?.log("info", "app.signal.received", { attributes: { signal } })
			app.quit()
		})
	}

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
