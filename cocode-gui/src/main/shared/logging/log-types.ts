export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export type LogProcessType = "main" | "preload" | "renderer" | "supervisor" | "dsh-host" | "tui"

export type LogSource = "desktop" | "audit" | "host" | "tui"

export type LogOutcome = "started" | "success" | "failure" | "cancelled" | "degraded"

export type LogAttribute = string | number | boolean | null

export interface SerializedError {
	readonly name: string
	readonly message: string
	readonly code?: string
	readonly stack?: string
	readonly causeSummary?: string
}

export interface LogRecord {
	readonly timestamp: string
	readonly severityText: Uppercase<LogLevel>
	readonly eventName: string
	readonly message?: string
	readonly serviceName: "cocode-desktop" | "cocode-host-supervisor" | "cocode-tui"
	readonly serviceVersion: string
	readonly buildId?: string
	readonly appRunId: string
	readonly eventId: string
	readonly sequence: number
	readonly source: LogSource
	readonly processType: LogProcessType
	readonly component: string
	readonly operation?: string
	readonly outcome?: LogOutcome
	readonly durationMs?: number
	readonly correlationId?: string
	readonly traceId?: string
	readonly spanId?: string
	readonly error?: SerializedError
	readonly attributes?: Readonly<Record<string, LogAttribute>>
}

export type { RendererLogRecordDto } from "../../../contracts/ipc/diagnostics.contract"

export interface LogStatus {
	readonly appLogBytes: number
	readonly auditLogBytes: number
	readonly hostLogBytes: number
	readonly tuiLogBytes: number
	readonly crashCount: number
	readonly temporaryDebugUntil?: string
	readonly droppedRecordCount: number
}

export function severityText(level: LogLevel): Uppercase<LogLevel> {
	return level.toUpperCase() as Uppercase<LogLevel>
}
