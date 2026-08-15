export const COCODE_SIDEBAR_PACKAGE = "cocode-sidebar"

/** Build the Electron-only overlay in a file owned by the Electron app. */
export function createDshDesktopPatch(noopHmrUrl: string): string {
	return [
		"- insert:",
		"    - id: dsh-desktop-hmr",
		`      name: ${JSON.stringify(noopHmrUrl)}`,
		"    - id: cocode-sidebar",
		`      name: ${JSON.stringify(COCODE_SIDEBAR_PACKAGE)}`,
		"",
	].join("\n")
}
