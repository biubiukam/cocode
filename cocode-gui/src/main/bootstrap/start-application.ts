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
import { createMainWindow } from "../shell/windows/create-main-window"
import { createDatabaseModule, type DatabaseModule } from "./create-database-module"
import { ShortcutService } from "../contexts/shortcuts/application/shortcut-service"
import {
	registerShortcutsIpc,
	unregisterShortcutsIpc,
} from "../contexts/shortcuts/presentation/ipc/register-shortcuts-ipc"

export const startApplication = (): void => {
	if (started) {
		app.quit()
		return
	}

	let databaseModule: DatabaseModule | null = null
	let dshRuntime: DshRuntimeProcess | null = null
	let account: AccountService | null = null
	let shortcuts: ShortcutService | null = null
	let mainWindow: BrowserWindow | null = null
	let dshUrl: string | null = null

	registerApplicationLifecycle({
		createWindow: () => {
			if (!dshUrl) throw new Error("DSH runtime URL was not available after startup.")
			mainWindow = createMainWindow(dshUrl)
			mainWindow.once("closed", () => {
				mainWindow = null
			})
		},
		onReady: async () => {
			databaseModule = createDatabaseModule(app.getPath("home"))
			databaseModule.initialize()
			dshRuntime = new DshRuntimeProcess()
			registerDshRuntimeIpc(dshRuntime)
			dshUrl = await dshRuntime.start()
			account = new AccountService(
				new DshCloudConfigPort(dshRuntime),
				new AgencyClient(undefined, {
					allowOriginOverride: !app.isPackaged,
					allowLocalHttp: !app.isPackaged,
				}),
			)
			registerAccountIpc(account)
			void account.hydrate()
			shortcuts = new ShortcutService(() => mainWindow)
			registerShortcutsIpc(shortcuts)
		},
		onBeforeQuit: async () => {
			unregisterShortcutsIpc()
			shortcuts?.dispose()
			shortcuts = null
			mainWindow = null
			unregisterAccountIpc()
			account?.dispose()
			account = null
			unregisterDshRuntimeIpc()
			databaseModule?.dispose()
			databaseModule = null
			await dshRuntime?.stop()
			dshRuntime = null
			dshUrl = null
		},
	})
}
