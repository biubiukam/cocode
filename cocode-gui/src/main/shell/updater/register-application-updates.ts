import { app, autoUpdater, dialog } from "electron"
import { UpdateSourceType, updateElectronApp, type IUpdateElectronApp } from "update-electron-app"
import packageMetadata from "../../../../package.json"
import {
	resolveApplicationUpdateConfig,
	resolveGitHubRepositoryFromUrl,
	type ApplicationUpdateConfig,
} from "./application-update-config"

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
	let updater: IUpdateElectronApp | null = null
	updater = updateElectronApp({
		updateSource: {
			type: UpdateSourceType.ElectronPublicUpdateService,
			repo: config.repository,
		},
		updateInterval: config.updateInterval,
		notifyUser: true,
		onNotifyUser: ({ releaseName }) => {
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
		},
	})

	return {
		dispose: () => {
			updater?.stopUpdates()
			updater = null
		},
	}
}

function createInactiveRegistration(): ApplicationUpdateRegistration {
	return { dispose: () => undefined }
}
