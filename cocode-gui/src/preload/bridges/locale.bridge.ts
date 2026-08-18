import { ipcRenderer } from "electron"
import type { LocaleApi } from "../../contracts/ipc/locale.contract"
import { localeChannels } from "../../contracts/ipc/locale.contract"

export const localeBridge: LocaleApi = {
	set: (locale) => ipcRenderer.send(localeChannels.set, locale),
}
