import { app } from "electron"
import started from "electron-squirrel-startup"
import { DshRuntimeProcess } from "../contexts/dsh-runtime/infrastructure/dsh-runtime-process"
import {
	registerDshRuntimeIpc,
	unregisterDshRuntimeIpc,
} from "../contexts/dsh-runtime/presentation/ipc/register-dsh-runtime-ipc"
import { registerApplicationLifecycle } from "../shell/lifecycle/register-application-lifecycle"
import { createMainWindow } from "../shell/windows/create-main-window"
import { createDatabaseModule, type DatabaseModule } from "./create-database-module"

export const startApplication = (): void => {
	if (started) {
		app.quit()
		return
	}

	let databaseModule: DatabaseModule | null = null
	let dshRuntime: DshRuntimeProcess | null = null
	let dshUrl: string | null = null

	registerApplicationLifecycle({
		createWindow: () => {
			if (!dshUrl) throw new Error("DSH runtime URL was not available after startup.")
			createMainWindow(dshUrl)
		},
		onReady: async () => {
			databaseModule = createDatabaseModule(app.getPath("home"))
			databaseModule.initialize()
			dshRuntime = new DshRuntimeProcess()
			registerDshRuntimeIpc(dshRuntime)
			dshUrl = await dshRuntime.start()
		},
		onBeforeQuit: async () => {
			unregisterDshRuntimeIpc()
			databaseModule?.dispose()
			databaseModule = null
			await dshRuntime?.stop()
			dshRuntime = null
			dshUrl = null
		},
	})
}
