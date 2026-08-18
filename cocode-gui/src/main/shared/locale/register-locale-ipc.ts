import { ipcMain } from "electron"
import { localeChannels, type LocaleId } from "../../../contracts/ipc/locale.contract"
import type { ApplicationLocale } from "./application-locale"

export function registerLocaleIpc(locale: ApplicationLocale): void {
	ipcMain.on(localeChannels.set, (_event, value: unknown) => {
		if (value === "zh" || value === "en") locale.set(value as LocaleId)
	})
}

export function unregisterLocaleIpc(): void {
	ipcMain.removeAllListeners(localeChannels.set)
}
