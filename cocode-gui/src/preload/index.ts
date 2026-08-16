import { contextBridge } from "electron"
import type { DesktopApi } from "../contracts/ipc/desktop.contract"
import { databaseBridge } from "./bridges/database.bridge"
import { dshRuntimeBridge } from "./bridges/dsh-runtime.bridge"
import { accountBridge } from "./bridges/account.bridge"
import { shortcutsBridge } from "./bridges/shortcuts.bridge"
import { diagnosticsBridge } from "./bridges/diagnostics.bridge"

const desktopApi: DesktopApi = {
	database: databaseBridge,
	dsh: dshRuntimeBridge,
	account: accountBridge,
	shortcuts: shortcutsBridge,
	diagnostics: diagnosticsBridge,
}

contextBridge.exposeInMainWorld("desktopApi", desktopApi)
