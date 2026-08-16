import { ipcRenderer } from "electron"
import { tuiChannels, type TuiApi } from "../../contracts/ipc/tui.contract"

export const tuiBridge: TuiApi = {
	getCommandLineToolStatus: () => ipcRenderer.invoke(tuiChannels.getCommandLineToolStatus),
	repairCommandLineTool: () => ipcRenderer.invoke(tuiChannels.repairCommandLineTool),
	openInTerminal: () => ipcRenderer.invoke(tuiChannels.openInTerminal),
}
