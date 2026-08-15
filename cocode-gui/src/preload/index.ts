import { contextBridge } from "electron"
import type { DesktopApi } from "../contracts/ipc/desktop.contract"
import { databaseBridge } from "./bridges/database.bridge"
import { dshRuntimeBridge } from "./bridges/dsh-runtime.bridge"

const desktopApi: DesktopApi = {
	database: databaseBridge,
	dsh: dshRuntimeBridge,
}

contextBridge.exposeInMainWorld("desktopApi", desktopApi)
