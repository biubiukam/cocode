import { ipcMain, webContents } from "electron"
import { accountChannels } from "../../../../../contracts/ipc/account.contract"
import type { AccountService } from "../../application/account-service"

export function registerAccountIpc(account: AccountService): void {
	ipcMain.handle(accountChannels.snapshot, () => account.snapshot())
	ipcMain.handle(accountChannels.signIn, () => account.signIn())
	ipcMain.handle(accountChannels.signOut, () => account.signOut())
	account.onChanged((snapshot) => {
		for (const contents of webContents.getAllWebContents()) {
			if (!contents.isDestroyed()) contents.send(accountChannels.changed, snapshot)
		}
	})
}

export function unregisterAccountIpc(): void {
	ipcMain.removeHandler(accountChannels.snapshot)
	ipcMain.removeHandler(accountChannels.signIn)
	ipcMain.removeHandler(accountChannels.signOut)
}
