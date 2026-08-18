export const diagnosticsChannels = {
	writeBatch: "diagnostics:write-batch",
	getStatus: "diagnostics:get-status",
	openLogFolder: "diagnostics:open-log-folder",
	exportBundle: "diagnostics:export-bundle",
	clearLogs: "diagnostics:clear-logs",
	enableTemporaryDebug: "diagnostics:enable-temporary-debug",
	queryLogs: "diagnostics:query-logs",
	listLogSources: "diagnostics:list-log-sources",
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
	readonly auditLogBytes: number
	readonly hostLogBytes: number
	readonly tuiLogBytes: number
	readonly crashCount: number
	readonly temporaryDebugUntil?: string
	readonly droppedRecordCount: number
	readonly resources?: ResourceSummaryDto
}

export interface DiagnosticsLogQueryDto {
	readonly from?: string
	readonly to?: string
	readonly levels?: readonly DiagnosticsLogLevel[]
	readonly sources?: readonly ("desktop" | "audit" | "host" | "tui")[]
	readonly processTypes?: readonly (
		| "main"
		| "preload"
		| "renderer"
		| "supervisor"
		| "dsh-host"
		| "tui"
	)[]
	readonly eventName?: string
	readonly appRunId?: string
	readonly hostKey?: string
	readonly correlationId?: string
	readonly sessionIdHash?: string
	readonly text?: string
	readonly limit?: number
	readonly cursor?: string
}

export interface DiagnosticsLogRecordDto {
	readonly timestamp: string
	readonly severityText?: string
	readonly eventName: string
	readonly message?: string
	readonly source: "desktop" | "audit" | "host" | "tui"
	readonly serviceName?: string
	readonly serviceVersion?: string
	readonly appRunId?: string
	readonly eventId?: string
	readonly sequence?: number
	readonly processType?: string
	readonly component?: string
	readonly operation?: string
	readonly outcome?: DiagnosticsLogOutcome
	readonly durationMs?: number
	readonly correlationId?: string
	readonly traceId?: string
	readonly spanId?: string
	readonly hostKey?: string
	readonly sessionIdHash?: string
	readonly attributes?: Readonly<Record<string, DiagnosticsLogAttribute>>
	readonly error?: {
		readonly name?: string
		readonly message?: string
		readonly code?: string
		readonly stack?: string
		readonly causeSummary?: string
	}
}

export interface DiagnosticsLogQueryResultDto {
	readonly items: readonly DiagnosticsLogRecordDto[]
	readonly nextCursor?: string
	readonly scannedFiles: number
}

export interface DiagnosticsLogSourceDto {
	readonly source: "desktop" | "audit" | "host" | "tui"
	readonly relativePath: string
	readonly bytes: number
	readonly current: boolean
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
	readonly queryLogs: (query: DiagnosticsLogQueryDto) => Promise<DiagnosticsLogQueryResultDto>
	readonly listLogSources: () => Promise<readonly DiagnosticsLogSourceDto[]>
}
