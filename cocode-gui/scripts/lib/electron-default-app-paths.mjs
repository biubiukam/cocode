import * as path from "pathe"

export function electronDefaultAppTemporaryPrefix(defaultAppArchive) {
	return path.join(path.dirname(defaultAppArchive), ".cocode-electron-default-app-")
}
