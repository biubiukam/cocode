import { app, autoUpdater, dialog, type Event as ElectronEvent } from "electron"
import { UpdateSourceType, updateElectronApp, type IUpdateElectronApp } from "update-electron-app"
import packageMetadata from "../../../../package.json"
import {
	resolveApplicationUpdateConfig,
	resolveGitHubRepositoryFromUrl,
	resolvePublicMsixFeedUrl,
	type ApplicationUpdateConfig,
} from "./application-update-config"
import { resolveUpdateIntervalMilliseconds } from "./update-interval"

export interface ApplicationUpdateLifecycle {
	readonly requestQuitForUpdate: (installUpdate: () => void) => boolean
}

export interface ApplicationUpdateRegistration {
	readonly dispose: () => void
}

export function registerApplicationUpdates(
	lifecycle: ApplicationUpdateLifecycle,
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
				buttons: ["立即重启", "稍后"],
				defaultId: 0,
				cancelId: 1,
				noLink: true,
				title: "Cocode Desktop 更新",
				message: `新版本 ${releaseName || "已下载"}`,
				detail: "重启后将自动安装更新。重启前会安全停止 DSH 运行时并关闭本地数据库。",
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

	if (config.channel === "msix") {
		return registerMsixUpdates(config, promptForUpdate)
	}

	let updater: IUpdateElectronApp | null = null
	updater = updateElectronApp({
		updateSource: {
			type: UpdateSourceType.ElectronPublicUpdateService,
			repo: config.repository,
		},
		updateInterval: config.updateInterval,
		notifyUser: true,
		onNotifyUser: ({ releaseName }) => promptForUpdate(releaseName),
	})

	return {
		dispose: () => {
			updater?.stopUpdates()
			updater = null
		},
	}
}

function registerMsixUpdates(
	config: Extract<ApplicationUpdateConfig, { enabled: true }>,
	promptForUpdate: (releaseName?: string) => void,
): ApplicationUpdateRegistration {
	const architecture = resolveWindowsUpdateArchitecture(process.arch)
	const feedUrl = resolvePublicMsixFeedUrl(config.repository, architecture, app.getVersion())
	console.info(`Registering MSIX automatic updates from ${feedUrl}`)
	autoUpdater.setFeedURL({ url: feedUrl })
	const onCheckingForUpdate = () => {
		console.info("Checking for an MSIX application update.")
	}
	const onUpdateAvailable = () => {
		console.info("An MSIX application update is available and is being downloaded.")
	}
	const onUpdateDownloaded = (
		_event: ElectronEvent,
		_releaseNotes: string,
		releaseName: string,
	) => {
		promptForUpdate(releaseName)
	}
	const onUpdaterError = (error: Error) => {
		console.error("MSIX automatic update failed:", error)
	}
	autoUpdater.on("checking-for-update", onCheckingForUpdate)
	autoUpdater.on("update-available", onUpdateAvailable)
	autoUpdater.on("update-downloaded", onUpdateDownloaded)
	autoUpdater.on("error", onUpdaterError)
	const checkForUpdates = () => {
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
	return { dispose: () => undefined }
}
