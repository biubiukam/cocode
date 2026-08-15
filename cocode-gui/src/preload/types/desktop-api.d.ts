import type { DesktopApi } from "../../contracts/ipc/desktop.contract"

declare global {
	interface Window {
		readonly desktopApi: DesktopApi
	}
}

export {}
