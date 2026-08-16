export const tuiChannels = {
	getCommandLineToolStatus: "tui:get-command-line-tool-status",
	repairCommandLineTool: "tui:repair-command-line-tool",
	openInTerminal: "tui:open-in-terminal",
} as const

export type TuiCommandLineToolState = "installed" | "missing" | "stale" | "conflict" | "unavailable"

export type TuiCommandLineToolStatus = {
	readonly state: TuiCommandLineToolState
	readonly path: string
	readonly directory: string
	readonly managedByDesktop: boolean
	readonly directoryOnPath: boolean
	readonly canRepair: boolean
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
