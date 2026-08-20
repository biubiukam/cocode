import { ipcRenderer } from "electron"
import { startupChannels, type StartupApi } from "../../contracts/ipc/startup.contract"

export const startupBridge: StartupApi = {
	restart: () => ipcRenderer.invoke(startupChannels.restart) as Promise<boolean>,
	quit: () => ipcRenderer.invoke(startupChannels.quit) as Promise<boolean>,
}
