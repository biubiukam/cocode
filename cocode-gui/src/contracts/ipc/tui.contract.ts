export const tuiChannels = {
	getCommandLineToolStatus: "tui:get-command-line-tool-status",
	repairCommandLineTool: "tui:repair-command-line-tool",
	openInTerminal: "tui:open-in-terminal",
} as const

export type TuiCommandLineToolState = "installed" | "missing" | "stale" | "conflict" | "unavailable"

export type TuiCommandLineToolRegistrationSource =
	| "installer"
	| "desktop-startup"
	| "manual"
	| "unknown"

export type TuiCommandLineToolStatus = {
	readonly state: TuiCommandLineToolState
	readonly path: string
	readonly directory: string
	readonly managedByDesktop: boolean
	readonly directoryOnPath: boolean
	readonly persistentPathConfigured: boolean
	readonly canRepair: boolean
	readonly registrationSource: TuiCommandLineToolRegistrationSource
	readonly runtimeValid: boolean
	readonly runtimeVersion?: string
	readonly tuiVersion?: string
	readonly supervisorVersion?: string
	readonly manifestFingerprint?: string
	readonly detail?: string
}

export type TuiCommandLineToolResult = {
	readonly changed: boolean
	readonly status: TuiCommandLineToolStatus
}

export type TuiApi = {
	readonly getCommandLineToolStatus: () => Promise<TuiCommandLineToolStatus>
	readonly repairCommandLineTool: () => Promise<TuiCommandLineToolResult>
	readonly openInTerminal: () => Promise<void>
}
