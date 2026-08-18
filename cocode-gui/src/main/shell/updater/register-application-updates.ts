import { app, autoUpdater, dialog } from "electron"
import { UpdateSourceType, updateElectronApp, type IUpdateElectronApp } from "update-electron-app"
import packageMetadata from "../../../../package.json"
import {
	createApplicationUpdateCoordinator,
	type ApplicationUpdateCoordinator,
	type ApplicationUpdateEventSource,
	type ApplicationUpdateState,
} from "./application-update-coordinator"
import {
	resolveApplicationUpdateConfig,
	resolveGitHubRepositoryFromUrl,
	resolvePublicMsixFeedUrl,
	type ApplicationUpdateConfig,
} from "./application-update-config"
import { resolveUpdateIntervalMilliseconds } from "./update-interval"
import type { ApplicationLocale } from "../../shared/locale/application-locale"

export interface ApplicationUpdateLifecycle {
	readonly requestQuitForUpdate: (installUpdate: () => void) => boolean
}

export type ApplicationUpdateRegistration = ApplicationUpdateCoordinator

export function registerApplicationUpdates(
	lifecycle: ApplicationUpdateLifecycle,
	locale?: ApplicationLocale,
): ApplicationUpdateRegistration {
	let config: ApplicationUpdateConfig
	try {
		config = resolveApplicationUpdateConfig({
			packaged: app.isPackaged,
			platform: process.platform,
			architecture: process.arch,
			defaultRepository: resolveGitHubRepositoryFromUrl(packageMetadata.repository.url),
			windowsStore: process.windowsStore,
		})
	} catch (error) {
		console.error("Automatic updates are disabled because configuration is invalid:", error)
		return createInactiveRegistration()
	}

	if (config.enabled === false) {
		console.info(`Automatic updates are disabled: ${config.reason}.`)
		return createInactiveRegistration()
	}

	let promptOpen = false
	const promptForUpdate = (releaseName?: string) => {
		if (promptOpen) return
		promptOpen = true
		void dialog
			.showMessageBox({
				type: "info",
				buttons: locale?.get() === "en" ? ["Restart Now", "Later"] : ["立即重启", "稍后"],
				defaultId: 0,
				cancelId: 1,
				noLink: true,
				title: locale?.get() === "en" ? "Cocode Desktop Update" : "Cocode Desktop 更新",
				message:
					locale?.get() === "en"
						? `New version ${releaseName || "downloaded"}`
						: `新版本 ${releaseName || "已下载"}`,
				detail:
					locale?.get() === "en"
						? "The update will install after restart. DSH runtime and the local database will stop safely first."
						: "重启后将自动安装更新。重启前会安全停止 DSH 运行时并关闭本地数据库。",
			})
			.then(({ response }) => {
				if (response !== 0) return
				lifecycle.requestQuitForUpdate(() => autoUpdater.quitAndInstall())
			})
			.catch((error: unknown) => {
				console.error("Failed to show the downloaded update prompt:", error)
			})
			.finally(() => {
				promptOpen = false
			})
	}
	const coordinator = createApplicationUpdateCoordinator({
		enabled: true,
		version: app.getVersion(),
		updater: autoUpdater as unknown as ApplicationUpdateEventSource,
		onStateChange: () => undefined,
		onLatest: (version) => showLatestVersionDialog(version, locale),
		onError: (error) => handleUpdateError(error, locale),
		onDownloaded: promptForUpdate,
	})

	if (config.channel === "msix") {
		const msix = registerMsixUpdates(config)
		return {
			enabled: true,
			checkNow: coordinator.checkNow,
			subscribe: coordinator.subscribe,
			dispose: () => {
				msix.dispose()
				coordinator.dispose()
			},
		}
	}

	let updater: IUpdateElectronApp | null = null
	updater = updateElectronApp({
		updateSource: {
			type: UpdateSourceType.ElectronPublicUpdateService,
			repo: config.repository,
		},
		updateInterval: config.updateInterval,
		notifyUser: false,
	})

	return {
		enabled: true,
		checkNow: coordinator.checkNow,
		subscribe: coordinator.subscribe,
		dispose: () => {
			coordinator.dispose()
			updater?.stopUpdates()
			updater = null
		},
	}
}

function registerMsixUpdates(config: Extract<ApplicationUpdateConfig, { enabled: true }>): {
	readonly dispose: () => void
} {
	const architecture = resolveWindowsUpdateArchitecture(process.arch)
	const feedUrl = resolvePublicMsixFeedUrl(config.repository, architecture, app.getVersion())
	console.info(`Registering MSIX automatic updates from ${feedUrl}`)
	autoUpdater.setFeedURL({ url: feedUrl })
	let checkInFlight = false
	const onCheckingForUpdate = () => {
		checkInFlight = true
		console.info("Checking for an MSIX application update.")
	}
	const onUpdateNotAvailable = () => {
		checkInFlight = false
		console.info("No MSIX application update is available.")
	}
	const onUpdateAvailable = () => {
		checkInFlight = true
		console.info("An MSIX application update is available and is being downloaded.")
	}
	const onUpdateDownloaded = () => {
		checkInFlight = false
	}
	const onUpdaterError = (error: Error) => {
		checkInFlight = false
		console.error("MSIX automatic update failed:", error)
	}
	autoUpdater.on("checking-for-update", onCheckingForUpdate)
	autoUpdater.on("update-not-available", onUpdateNotAvailable)
	autoUpdater.on("update-available", onUpdateAvailable)
	autoUpdater.on("update-downloaded", onUpdateDownloaded)
	autoUpdater.on("error", onUpdaterError)
	const checkForUpdates = () => {
		if (checkInFlight) return
		try {
			autoUpdater.checkForUpdates()
		} catch (error) {
			onUpdaterError(error instanceof Error ? error : new Error(String(error)))
		}
	}
	checkForUpdates()
	const timer = setInterval(
		checkForUpdates,
		resolveUpdateIntervalMilliseconds(config.updateInterval),
	)
	timer.unref?.()
	return {
		dispose: () => {
			clearInterval(timer)
			autoUpdater.removeListener("checking-for-update", onCheckingForUpdate)
			autoUpdater.removeListener("update-not-available", onUpdateNotAvailable)
			autoUpdater.removeListener("update-available", onUpdateAvailable)
			autoUpdater.removeListener("update-downloaded", onUpdateDownloaded)
			autoUpdater.removeListener("error", onUpdaterError)
		},
	}
}

function resolveWindowsUpdateArchitecture(architecture: string): "x64" | "arm64" {
	if (architecture === "x64" || architecture === "arm64") return architecture
	throw new Error(`Unsupported Windows update architecture: ${architecture}`)
}

function createInactiveRegistration(): ApplicationUpdateRegistration {
	return {
		enabled: false,
		checkNow: () => undefined,
		subscribe: (_listener: (state: ApplicationUpdateState) => void) => () => undefined,
		dispose: () => undefined,
	}
}

function showLatestVersionDialog(version: string, locale?: ApplicationLocale): void {
	const english = locale?.get() === "en"
	void dialog
		.showMessageBox({
			type: "info",
			noLink: true,
			title: english ? "Check for Updates" : "检查更新",
			message: english ? "You're up to date" : "当前版本已经是最新",
			detail: english ? `Current version: v${version}` : `当前版本：v${version}`,
		})
		.catch((error: unknown) => {
			console.error("Failed to show the latest-version dialog:", error)
		})
}

function showUpdateErrorDialog(locale?: ApplicationLocale): void {
	const english = locale?.get() === "en"
	void dialog
		.showMessageBox({
			type: "error",
			noLink: true,
			title: english ? "Update Check Failed" : "检查更新失败",
			message: english
				? "Couldn't check for updates. Try again later."
				: "检查更新失败，请稍后重试",
		})
		.catch((error: unknown) => {
			console.error("Failed to show the update-error dialog:", error)
		})
}

function handleUpdateError(error: Error, locale?: ApplicationLocale): void {
	console.error("Application update check failed:", error)
	showUpdateErrorDialog(locale)
}
