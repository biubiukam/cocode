export const diagnosticsChannels = {
	writeBatch: "diagnostics:write-batch",
	getStatus: "diagnostics:get-status",
	openLogFolder: "diagnostics:open-log-folder",
	exportBundle: "diagnostics:export-bundle",
	clearLogs: "diagnostics:clear-logs",
	enableTemporaryDebug: "diagnostics:enable-temporary-debug",
} as const

export type DiagnosticsLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal"
export type DiagnosticsLogOutcome = "started" | "success" | "failure" | "cancelled" | "degraded"
export type DiagnosticsLogAttribute = string | number | boolean | null

export interface RendererLogRecordDto {
	readonly level: DiagnosticsLogLevel
	readonly eventName: string
	readonly message?: string
	readonly component?: string
	readonly operation?: string
	readonly outcome?: DiagnosticsLogOutcome
	readonly durationMs?: number
	readonly correlationId?: string
	readonly attributes?: Readonly<Record<string, DiagnosticsLogAttribute>>
}

export interface DiagnosticsStatusDto {
	readonly appLogBytes: number
	readonly hostLogBytes: number
	readonly crashCount: number
	readonly temporaryDebugUntil?: string
	readonly droppedRecordCount: number
	readonly resources?: ResourceSummaryDto
}

export interface ResourceSummaryDto {
	readonly sampleCount: number
	readonly latest?: {
		readonly at: string
		readonly mainRssBytes: number
		readonly mainHeapUsedBytes: number
		readonly electronWorkingSetBytes: number
		readonly hostRssBytes?: number
		readonly processCount: number
	}
}

export interface TemporaryDebugRequestDto {
	readonly durationMinutes: 30 | 60
}

export interface TemporaryDebugDto {
	readonly enabledUntil: string
}

export interface DiagnosticsBundleDto {
	readonly cancelled: boolean
	readonly fileName?: string
	readonly bytes?: number
}

export interface DiagnosticsApi {
	readonly log: {
		readonly writeBatch: (records: readonly RendererLogRecordDto[]) => void
	}
	readonly getStatus: () => Promise<DiagnosticsStatusDto>
	readonly openLogFolder: () => Promise<void>
	readonly exportBundle: () => Promise<DiagnosticsBundleDto>
	readonly clearLogs: () => Promise<void>
	readonly enableTemporaryDebug: (request: TemporaryDebugRequestDto) => Promise<TemporaryDebugDto>
}
