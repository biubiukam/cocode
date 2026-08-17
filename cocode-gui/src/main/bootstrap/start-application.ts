import { app, type BrowserWindow } from "electron"
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
import { acquireSingleInstanceLock } from "../shell/lifecycle/single-instance-guard"
import {
	registerApplicationUpdates,
	type ApplicationUpdateRegistration,
} from "../shell/updater/register-application-updates"
import { applyDockIcon } from "../shell/windows/app-icon"
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
import { TuiLauncher } from "../contexts/tui/infrastructure/tui-launcher"
import { registerTuiIpc, unregisterTuiIpc } from "../contexts/tui/presentation/ipc/register-tui-ipc"
import { detectSquirrelEvent, handleSquirrelEvent } from "./squirrel-events"

export const startApplication = (): void => {
	const squirrelEvent = detectSquirrelEvent()
	if (squirrelEvent !== undefined) {
		void handleSquirrelEvent(squirrelEvent)
		return
	}

	// Claimed before observability, the database and the DSH runtime start, so a
	// duplicate launch never touches state the running instance owns.
	if (!acquireSingleInstanceLock()) return

	const observability = createDesktopObservability()
	const unregisterElectronObservers = registerElectronObservers(observability.logger)
	registerDiagnosticsIpc(observability.diagnostics, observability.logger)

	let databaseModule: DatabaseModule | null = null
	let dshRuntime: DshRuntimeProcess | null = null
	let account: AccountService | null = null
	let shortcuts: ShortcutService | null = null
	let mainWindow: BrowserWindow | null = null
	let dshUrl: string | null = null
	let rebindDshRuntimeOrigin: ((origin: string) => void) | null = null
	let applicationUpdates: ApplicationUpdateRegistration | null = null
	let tuiLauncher: TuiLauncher | null = null

	const lifecycle = registerApplicationLifecycle({
		logger: observability.logger,
		createWindow: () => {
			if (!dshUrl) throw new Error("DSH runtime URL was not available after startup.")
			observability.logger.log("info", "window.create.started")
			mainWindow = createMainWindow(dshUrl, observability.logger, {
				registerRuntimeOriginRebind: (rebind) => {
					rebindDshRuntimeOrigin = rebind
				},
			})
			mainWindow.once("closed", () => {
				observability.logger.log("info", "window.closed")
				mainWindow = null
			})
		},
		onReady: async () => {
			observability.logger.log("info", "app.ready.started")
			applyDockIcon()
			databaseModule = createDatabaseModule(app.getPath("home"), observability.logger)
			try {
				databaseModule.initialize()
				observability.logger.log("info", "database.opened")
			} catch (error) {
				observability.logger.log("error", "database.open.failed", { error })
				throw error
			}
			dshRuntime = new DshRuntimeProcess(observability.logger)
			tuiLauncher = new TuiLauncher()
			if (shouldAutoInstallCommandLineTool()) {
				try {
					const result = await tuiLauncher.ensureCommandLineTool()
					const warning =
						result.status.state === "conflict" || result.status.state === "unavailable"
					observability.logger.log(
						warning ? "warn" : "info",
						"tui.cli.ensure.completed",
						{
							attributes: {
								state: result.status.state,
								changed: result.changed,
								directoryOnPath: result.status.directoryOnPath,
								persistentPathConfigured: result.status.persistentPathConfigured,
								registrationSource: result.status.registrationSource,
							},
						},
					)
				} catch (error) {
					observability.logger.log("warn", "tui.cli.ensure.failed", { error })
				}
			}
			registerTuiIpc(tuiLauncher, observability.logger)
			registerDshRuntimeIpc(dshRuntime, observability.logger, {
				onRebound: (origin) => rebindDshRuntimeOrigin?.(origin),
			})
			dshUrl = await dshRuntime.start()
			observability.resources.setHostPid(dshRuntime.hostPid)
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
				unregisterTuiIpc()
				tuiLauncher = null
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
				await dshRuntime?.shutdown()
				dshRuntime = null
				dshUrl = null
				rebindDshRuntimeOrigin = null
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

function shouldAutoInstallCommandLineTool(): boolean {
	const configured = process.env.COCODE_AUTO_INSTALL_CLI?.trim()
	if (configured === "0") return false
	return app.isPackaged || configured === "1"
}
