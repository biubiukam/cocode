import { app, nativeImage, type NativeImage } from "electron"
import * as path from "pathe"

/**
 * Packaged builds carry the Cocode icon inside the bundle (Forge writes it from
 * `packagerConfig.icon`), but development runs the stock Electron bundle, whose
 * icon is Electron's own. Loading the same source artwork at runtime keeps the
 * Dock, the task switcher and the window frame on brand while developing.
 */
export const resolveAppIcon = (): NativeImage | undefined => {
	if (app.isPackaged) return undefined
	const icon = nativeImage.createFromPath(
		path.join(app.getAppPath(), "resources", "icons", "cocode.png"),
	)
	return icon.isEmpty() ? undefined : icon
}

/** macOS ignores `BrowserWindow.icon`; the Dock image is the only lever. */
export const applyDockIcon = (): void => {
	if (process.platform !== "darwin") return
	const icon = resolveAppIcon()
	if (icon) app.dock?.setIcon(icon)
}
