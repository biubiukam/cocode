import { app, type BrowserWindow } from "electron"
import started from "electron-squirrel-startup"
import { DshRuntimeProcess } from "../contexts/dsh-runtime/infrastructure/dsh-runtime-process"
import { DshCloudConfigPort } from "../contexts/account/infrastructure/dsh-cloud-config-port"
import { AgencyClient } from "../contexts/account/infrastructure/agency-client"
import { AccountService } from "../contexts/account/application/account-service"
import {
	registerAccountIpc,
	unregisterAccountIpc,
} from "../contexts/account/presentation/ipc/register-account-ipc"
import {
	registerDshRuntimeIpc,
	unregisterDshRuntimeIpc,
} from "../contexts/dsh-runtime/presentation/ipc/register-dsh-runtime-ipc"
import { registerApplicationLifecycle } from "../shell/lifecycle/register-application-lifecycle"
import {
	registerApplicationUpdates,
	type ApplicationUpdateRegistration,
} from "../shell/updater/register-application-updates"
import { createMainWindow } from "../shell/windows/create-main-window"
import { createDatabaseModule, type DatabaseModule } from "./create-database-module"
import { ShortcutService } from "../contexts/shortcuts/application/shortcut-service"
import {
	registerShortcutsIpc,
	unregisterShortcutsIpc,
} from "../contexts/shortcuts/presentation/ipc/register-shortcuts-ipc"
import {
	registerDiagnosticsIpc,
	unregisterDiagnosticsIpc,
} from "../contexts/diagnostics/presentation/ipc/register-diagnostics-ipc"
import { createDesktopObservability } from "../shared/observability/desktop-observability"
import { registerElectronObservers } from "../shared/observability/register-electron-observers"

export const startApplication = (): void => {
	if (started) {
		app.quit()
		return
	}

	const observability = createDesktopObservability()
	const unregisterElectronObservers = registerElectronObservers(observability.logger)
	registerDiagnosticsIpc(observability.diagnostics, observability.logger)

	let databaseModule: DatabaseModule | null = null
	let dshRuntime: DshRuntimeProcess | null = null
	let account: AccountService | null = null
	let shortcuts: ShortcutService | null = null
	let mainWindow: BrowserWindow | null = null
	let dshUrl: string | null = null
	let applicationUpdates: ApplicationUpdateRegistration | null = null

	const lifecycle = registerApplicationLifecycle({
		logger: observability.logger,
		createWindow: () => {
			if (!dshUrl) throw new Error("DSH runtime URL was not available after startup.")
			observability.logger.log("info", "window.create.started")
			mainWindow = createMainWindow(dshUrl, observability.logger)
			mainWindow.once("closed", () => {
				observability.logger.log("info", "window.closed")
				mainWindow = null
			})
		},
		onReady: async () => {
			observability.logger.log("info", "app.ready.started")
			databaseModule = createDatabaseModule(app.getPath("home"), observability.logger)
			try {
				databaseModule.initialize()
				observability.logger.log("info", "database.opened")
			} catch (error) {
				observability.logger.log("error", "database.open.failed", { error })
				throw error
			}
			dshRuntime = new DshRuntimeProcess(observability.logger)
			registerDshRuntimeIpc(dshRuntime, observability.logger)
			dshUrl = await dshRuntime.start()
			observability.diagnostics.setHostLogDirectory(dshRuntime.hostLogDirectory)
			observability.logger.log("info", "dsh.host.ready", {
				attributes: { endpoint: redactEndpoint(dshUrl) },
			})
			account = new AccountService(
				new DshCloudConfigPort(dshRuntime),
				new AgencyClient(undefined, {
					allowOriginOverride: !app.isPackaged,
					allowLocalHttp: !app.isPackaged,
				}),
				{},
				observability.logger,
			)
			registerAccountIpc(account, observability.logger)
			void account.hydrate().then(
				() => observability.logger.log("info", "account.hydrate.completed"),
				(error) => observability.logger.log("warn", "account.hydrate.failed", { error }),
			)
			shortcuts = new ShortcutService(() => mainWindow)
			registerShortcutsIpc(shortcuts, observability.logger)
			applicationUpdates = registerApplicationUpdates(lifecycle)
			observability.logger.log("info", "app.ready.completed")
		},
		onBeforeQuit: async () => {
			observability.logger.log("info", "app.shutdown.started")
			applicationUpdates?.dispose()
			applicationUpdates = null
			try {
				unregisterDiagnosticsIpc()
				unregisterShortcutsIpc()
				shortcuts?.dispose()
				shortcuts = null
				mainWindow = null
				unregisterAccountIpc()
				account?.dispose()
				account = null
				unregisterDshRuntimeIpc()
				databaseModule?.dispose()
				observability.logger.log("info", "database.closed")
				databaseModule = null
				await dshRuntime?.stop()
				dshRuntime = null
				dshUrl = null
			} finally {
				unregisterElectronObservers()
				observability.dispose()
			}
		},
	})
}

function redactEndpoint(value: string): string {
	try {
		const url = new URL(value)
		return `${url.origin}${url.pathname}`
	} catch {
		return "<invalid-endpoint>"
	}
}
