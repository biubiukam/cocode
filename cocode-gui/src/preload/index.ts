import { contextBridge } from "electron"
import type { DesktopApi } from "../contracts/ipc/desktop.contract"
import { databaseBridge } from "./bridges/database.bridge"
import { dshRuntimeBridge } from "./bridges/dsh-runtime.bridge"
import { accountBridge } from "./bridges/account.bridge"

const desktopApi: DesktopApi = {
	database: databaseBridge,
	dsh: dshRuntimeBridge,
	account: accountBridge,
}

contextBridge.exposeInMainWorld("desktopApi", desktopApi)
