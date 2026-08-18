import { app, crashReporter } from "electron"
import * as path from "pathe"
import { readdirSync, statSync, unlinkSync } from "node:fs"
import { resolveCocodeLogLayout } from "@cocode-agency/host-supervisor"
import { DesktopLogger } from "../logging/desktop-logger"
import { createDiagnosticsService, type DiagnosticsService } from "./diagnostics-service"
import { ResourceMonitor } from "./resource-monitor"

export interface DesktopObservability {
	readonly logger: DesktopLogger
	readonly diagnostics: DiagnosticsService
	readonly resources: ResourceMonitor
	readonly dispose: () => void
}

export function createDesktopObservability(): DesktopObservability {
	const logLayout = resolveLogDirectory()
	const logger = new DesktopLogger({
		directory: logLayout.root,
		layout: "unified",
		serviceName: "cocode-desktop",
		serviceVersion: app.getVersion(),
		buildId: process.env.COCODE_BUILD_ID?.trim() || undefined,
		processType: "main",
		defaultLevel: "info",
	})
	const previousConsoleWarn = console.warn
	const previousConsoleError = console.error
	console.warn = (...args: unknown[]) => {
		logger.log("warn", "process.console-warn", { attributes: { argumentCount: args.length } })
		previousConsoleWarn(...args)
	}
	console.error = (...args: unknown[]) => {
		logger.log("error", "process.console-error", { attributes: { argumentCount: args.length } })
		previousConsoleError(...args)
	}
	const resources = new ResourceMonitor(logger)
	const diagnostics = createDiagnosticsService({
		logger,
		logRoot: logLayout.root,
		logLayout,
		buildId: process.env.COCODE_BUILD_ID?.trim() || undefined,
		resources,
	})
	resources.start()
	const removers: Array<() => void> = []

	logger.log("info", "app.start", {
		attributes: {
			platform: process.platform,
			architecture: process.arch,
			packaged: app.isPackaged,
		},
	})

	try {
		crashReporter.start({
			productName: "Cocode Desktop",
			uploadToServer: false,
			compress: true,
		})
		logger.log("info", "diagnostics.crash-reporter.initialized")
		pruneCrashDumps(logger)
	} catch (error) {
		logger.log("warn", "diagnostics.crash-reporter.initialization-failed", { error })
	}

	const onUncaughtException = (error: Error) => {
		logger.log("fatal", "process.uncaught-exception", { error })
		logger.flush()
		app.exit(1)
	}
	const onUnhandledRejection = (reason: unknown) => {
		logger.log("error", "process.unhandled-rejection", { error: reason })
	}
	process.on("uncaughtException", onUncaughtException)
	process.on("unhandledRejection", onUnhandledRejection)
	removers.push(() => process.off("uncaughtException", onUncaughtException))
	removers.push(() => process.off("unhandledRejection", onUnhandledRejection))

	return {
		logger,
		diagnostics,
		resources,
		dispose: () => {
			for (const remove of removers.splice(0)) remove()
			resources.dispose()
			logger.log("info", "app.shutdown.completed")
			console.warn = previousConsoleWarn
			console.error = previousConsoleError
			logger.close()
		},
	}
}

function pruneCrashDumps(logger: DesktopLogger): void {
	try {
		const directory = app.getPath("crashDumps")
		const files = readdirSync(directory, { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const fullPath = path.join(directory, entry.name)
				return { fullPath, stat: statSync(fullPath) }
			})
			.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
		let totalBytes = files.reduce((sum, entry) => sum + entry.stat.size, 0)
		for (const [index, file] of files.entries()) {
			if (index < 10 && totalBytes <= 100 * 1024 * 1024) continue
			unlinkSync(file.fullPath)
			totalBytes -= file.stat.size
		}
	} catch (error) {
		logger.log("warn", "diagnostics.crash-dumps.prune-failed", { error })
	}
}

function resolveLogDirectory(): ReturnType<typeof resolveCocodeLogLayout> {
	try {
		const layout = resolveCocodeLogLayout()
		app.setPath("logs", layout.root)
		app.setPath("crashDumps", layout.crashDumps)
		app.setAppLogsPath(layout.root)
		return layout
	} catch {
		const root = path.join(process.cwd(), ".cocode-logs")
		return {
			root,
			desktopApp: path.join(root, "desktop", "app"),
			desktopAudit: path.join(root, "desktop", "audit"),
			host: path.join(root, "host"),
			tui: path.join(root, "tui"),
			crashDumps: path.join(root, "crashDumps"),
			diagnostics: path.join(root, "diagnostics"),
		}
	}
}
