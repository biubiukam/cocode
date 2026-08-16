export const COCODE_WORKBENCH_PACKAGE = "cocode-workbench"
export const COCODE_ACCOUNT_PACKAGE = "cocode-account"
export const COCODE_SHORTCUTS_PACKAGE = "cocode-shortcuts"

/** Build the Electron-only overlay in a file owned by the Electron app. */
export function createDshDesktopPatch(noopHmrUrl: string): string {
	return [
		"- insert:",
		"    - id: dsh-desktop-hmr",
		`      name: ${JSON.stringify(noopHmrUrl)}`,
		"    - id: cocode-workbench",
		`      name: ${JSON.stringify(COCODE_WORKBENCH_PACKAGE)}`,
		"    - id: cocode-account",
		`      name: ${JSON.stringify(COCODE_ACCOUNT_PACKAGE)}`,
		"    - id: cocode-shortcuts",
		`      name: ${JSON.stringify(COCODE_SHORTCUTS_PACKAGE)}`,
		"",
	].join("\n")
}
