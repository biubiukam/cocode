import * as path from "pathe"

export const ELECTRON_PRELOAD_RELATIVE_PATH = path.join(".vite", "build", "preload.js")

export function resolveElectronPreloadPath(appPath: string): string {
	return path.join(appPath, ELECTRON_PRELOAD_RELATIVE_PATH)
}
