export type DiagnosticsStatus = {
	readonly appLogBytes: number
	readonly hostLogBytes: number
	readonly crashCount: number
	readonly temporaryDebugUntil?: string
	readonly droppedRecordCount: number
}

export type DiagnosticsApi = {
	readonly getStatus: () => Promise<DiagnosticsStatus>
	readonly openLogFolder: () => Promise<void>
	readonly exportBundle: () => Promise<{
		readonly cancelled: boolean
		readonly fileName?: string
		readonly bytes?: number
	}>
	readonly clearLogs: () => Promise<void>
	readonly enableTemporaryDebug: (request: {
		readonly durationMinutes: 30 | 60
	}) => Promise<{ readonly enabledUntil: string }>
}

export type TuiCommandLineToolState =
	| "installed"
	| "missing"
	| "stale"
	| "conflict"
	| "unavailable"

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

declare global {
	interface Window {
		readonly desktopApi?: {
			readonly diagnostics?: DiagnosticsApi
			readonly tui?: TuiApi
		}
	}
}

