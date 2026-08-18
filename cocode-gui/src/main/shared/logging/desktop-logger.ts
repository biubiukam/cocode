import { randomUUID } from "node:crypto"
import { appendFileSync, writeFileSync } from "node:fs"
import * as path from "pathe"
import pino, { type Logger as PinoLogger } from "pino"
import type {
	LogAttribute,
	LogLevel,
	LogOutcome,
	LogProcessType,
	LogSource,
	RendererLogRecordDto,
} from "./log-types"
import { serializeError } from "./error-serializer"
import { sanitizeAttributes, sanitizeRendererRecord } from "./redaction"
import { RotatingFileSink, readLogDirectoryBytes, type RotationPolicy } from "./rotating-file-sink"

const APP_POLICY: RotationPolicy = {
	maxBytes: 10 * 1024 * 1024,
	maxFiles: 7,
	maxAgeMs: 7 * 24 * 60 * 60 * 1000,
	maxTotalBytes: 100 * 1024 * 1024,
}

const AUDIT_POLICY: RotationPolicy = {
	maxBytes: 5 * 1024 * 1024,
	maxFiles: 6,
	maxAgeMs: 30 * 24 * 60 * 60 * 1000,
	maxTotalBytes: 30 * 1024 * 1024,
}

export interface LoggerBindings {
	readonly component: string
	readonly processType?: LogProcessType
	readonly operation?: string
	readonly correlationId?: string
	readonly attributes?: Readonly<Record<string, LogAttribute>>
}

export interface LoggerOptions {
	readonly directory: string
	readonly serviceName?: "cocode-desktop" | "cocode-host-supervisor" | "cocode-tui"
	readonly serviceVersion?: string
	readonly buildId?: string
	readonly processType?: LogProcessType
	readonly appRunId?: string
	readonly defaultLevel?: LogLevel
	readonly layout?: "legacy" | "unified"
}

export interface LogValues {
	readonly message?: string
	readonly outcome?: LogOutcome
	readonly durationMs?: number
	readonly error?: unknown
	readonly attributes?: Readonly<Record<string, LogAttribute>>
	readonly audit?: boolean
}

export class DesktopLogger {
	private readonly appSink: RotatingFileSink
	private readonly auditSink: RotatingFileSink
	private readonly appLogger: PinoLogger
	private readonly auditLogger: PinoLogger
	private readonly appDirectory: string
	private readonly auditDirectory: string
	private readonly emergencyPath: string
	private readonly serviceName: "cocode-desktop" | "cocode-host-supervisor" | "cocode-tui"
	private readonly serviceVersion: string
	private readonly buildId: string | undefined
	private readonly appRunId: string
	private readonly processType: LogProcessType
	private droppedRecordCount = 0
	private sequence = 0
	private temporaryDebugUntil: number | undefined
	private temporaryDebugTimer: ReturnType<typeof setTimeout> | undefined

	public constructor(options: LoggerOptions) {
		this.serviceName = options.serviceName ?? "cocode-desktop"
		this.serviceVersion = options.serviceVersion ?? "unknown"
		this.buildId = options.buildId
		this.appRunId = options.appRunId ?? randomUUID()
		this.processType = options.processType ?? "main"
		const layout = options.layout ?? "legacy"
		const desktopDirectory =
			layout === "unified" ? path.join(options.directory, "desktop") : options.directory
		this.appDirectory = path.join(desktopDirectory, "app")
		this.auditDirectory = path.join(desktopDirectory, "audit")
		this.emergencyPath = path.join(this.appDirectory, "emergency.jsonl")
		const errorSink = (error: unknown) => {
			this.droppedRecordCount += 1
			try {
				process.stderr.write(`[cocode-log] ${String(error)}\n`)
			} catch {
				/* best effort */
			}
		}
		this.appSink = new RotatingFileSink({
			directory: this.appDirectory,
			filename: "current.jsonl",
			policy: APP_POLICY,
			onError: errorSink,
		})
		this.auditSink = new RotatingFileSink({
			directory: this.auditDirectory,
			filename: "current.jsonl",
			policy: AUDIT_POLICY,
			onError: errorSink,
		})
		const level = options.defaultLevel ?? "info"
		this.appLogger = pino(
			{
				base: null,
				level,
				timestamp: false,
				formatters: { level: (label) => ({ severityText: label.toUpperCase() }) },
			},
			this.appSink,
		)
		this.auditLogger = pino(
			{
				base: null,
				level: "info",
				timestamp: false,
				formatters: { level: (label) => ({ severityText: label.toUpperCase() }) },
			},
			this.auditSink,
		)
	}

	public child(bindings: LoggerBindings): DesktopLoggerChild {
		return new DesktopLoggerChild(this, bindings)
	}

	public log(
		level: LogLevel,
		eventName: string,
		values: LogValues = {},
		bindings: Partial<LoggerBindings> = {},
	): void {
		const safe = normalizeValues(values)
		const combinedAttributes = sanitizeAttributes({
			...bindings.attributes,
			...safe.attributes,
		})
		const record = {
			timestamp: new Date().toISOString(),
			eventId: randomUUID(),
			sequence: ++this.sequence,
			source: (safe.audit === true ? "audit" : "desktop") as LogSource,
			eventName: safeText(eventName, 128),
			serviceName: this.serviceName,
			serviceVersion: this.serviceVersion,
			...(this.buildId === undefined ? {} : { buildId: this.buildId }),
			appRunId: this.appRunId,
			processType: bindings.processType ?? this.processType,
			component: bindings.component ?? "application",
			...(bindings.operation === undefined ? {} : { operation: bindings.operation }),
			...(bindings.correlationId === undefined
				? {}
				: { correlationId: bindings.correlationId }),
			...(safe.message === undefined ? {} : { message: safe.message }),
			...(safe.outcome === undefined ? {} : { outcome: safe.outcome }),
			...(safe.durationMs === undefined ? {} : { durationMs: safe.durationMs }),
			...(safe.error === undefined ? {} : { error: safe.error }),
			...(combinedAttributes === undefined ? {} : { attributes: combinedAttributes }),
		}
		const target = safe.audit === true ? this.auditLogger : this.appLogger
		if (level === "fatal") this.writeEmergency(record)
		const method = target[level] as (value: unknown, message?: string) => void
		method.call(target, record, record.message)
	}

	public trace(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("trace", eventName, { attributes })
	}

	public debug(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("debug", eventName, { attributes })
	}

	public info(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("info", eventName, { attributes })
	}

	public warn(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("warn", eventName, { attributes })
	}

	public error(
		eventName: string,
		error?: unknown,
		attributes?: Readonly<Record<string, LogAttribute>>,
	): void {
		this.log("error", eventName, { error, attributes })
	}

	public fatal(
		eventName: string,
		error?: unknown,
		attributes?: Readonly<Record<string, LogAttribute>>,
	): void {
		this.log("fatal", eventName, { error, attributes })
	}

	public operation<T>(
		eventName: string,
		values: LogValues | Readonly<Record<string, LogAttribute>>,
		operation: () => Promise<T>,
		bindings: Partial<LoggerBindings> = {},
	): Promise<T> {
		const normalizedValues: LogValues = isLogValues(values) ? values : { attributes: values }
		const started = Date.now()
		this.log("debug", eventName, { ...normalizedValues, outcome: "started" }, bindings)
		return operation().then(
			(result) => {
				this.log(
					"debug",
					eventName,
					{ ...normalizedValues, outcome: "success", durationMs: Date.now() - started },
					bindings,
				)
				return result
			},
			(error: unknown) => {
				this.log(
					"error",
					eventName,
					{
						...normalizedValues,
						outcome: "failure",
						durationMs: Date.now() - started,
						error,
					},
					bindings,
				)
				throw error
			},
		)
	}

	public recordRendererBatch(records: readonly RendererLogRecordDto[], senderId: number): void {
		for (const input of records.slice(0, 50)) {
			const record = sanitizeRendererRecord(input)
			this.log(record.level, record.eventName, record, {
				component: record.component ?? "renderer",
				processType: "renderer",
				operation: record.operation,
				correlationId: record.correlationId,
				attributes: { senderId, ...record.attributes },
			})
		}
		if (records.length > 50) this.droppedRecordCount += records.length - 50
	}

	public enableTemporaryDebug(durationMinutes: 30 | 60): Date {
		if (this.temporaryDebugTimer !== undefined) clearTimeout(this.temporaryDebugTimer)
		this.temporaryDebugUntil = Date.now() + durationMinutes * 60 * 1000
		this.appLogger.level = "debug"
		this.temporaryDebugTimer = setTimeout(() => {
			this.temporaryDebugUntil = undefined
			this.temporaryDebugTimer = undefined
			this.appLogger.level = "info"
		}, durationMinutes * 60 * 1000)
		this.temporaryDebugTimer.unref?.()
		return new Date(this.temporaryDebugUntil)
	}

	public get appRunIdValue(): string {
		return this.appRunId
	}

	public clear(): void {
		this.appSink.clear()
		this.auditSink.clear()
		try {
			writeFileSync(this.emergencyPath, "", { mode: 0o600 })
		} catch {
			/* best effort */
		}
	}

	public getStatus(crashCount: number, hostLogBytes = 0) {
		const until = this.temporaryDebugUntil
		if (until !== undefined && until <= Date.now()) {
			this.temporaryDebugUntil = undefined
			this.appLogger.level = "info"
		}
		return {
			appLogBytes: readLogDirectoryBytes(this.appDirectory),
			auditLogBytes: readLogDirectoryBytes(this.auditDirectory),
			hostLogBytes,
			tuiLogBytes: 0,
			crashCount,
			...(this.temporaryDebugUntil === undefined
				? {}
				: { temporaryDebugUntil: new Date(this.temporaryDebugUntil).toISOString() }),
			droppedRecordCount: this.droppedRecordCount,
		}
	}

	public flush(): void {
		this.appLogger.flush()
		this.auditLogger.flush()
		this.appSink.flush()
		this.auditSink.flush()
	}

	public close(): void {
		if (this.temporaryDebugTimer !== undefined) clearTimeout(this.temporaryDebugTimer)
		this.temporaryDebugTimer = undefined
		this.flush()
		this.appSink.close()
		this.auditSink.close()
	}

	private writeEmergency(record: object): void {
		try {
			appendFileSync(this.emergencyPath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
		} catch (error) {
			this.droppedRecordCount += 1
			try {
				process.stderr.write(`[cocode-log-emergency] ${String(error)}\n`)
			} catch {
				/* best effort */
			}
		}
	}
}

export class DesktopLoggerChild {
	public constructor(
		private readonly logger: DesktopLogger,
		private readonly bindings: LoggerBindings,
	) {}

	public child(bindings: LoggerBindings): DesktopLoggerChild {
		return new DesktopLoggerChild(this.logger, {
			...this.bindings,
			...bindings,
			attributes: { ...this.bindings.attributes, ...bindings.attributes },
		})
	}

	public log(level: LogLevel, eventName: string, values?: LogValues): void {
		this.logger.log(level, eventName, values, this.bindings)
	}
	public info(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("info", eventName, { attributes })
	}
	public debug(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("debug", eventName, { attributes })
	}
	public warn(eventName: string, attributes?: Readonly<Record<string, LogAttribute>>): void {
		this.log("warn", eventName, { attributes })
	}
	public error(
		eventName: string,
		error?: unknown,
		attributes?: Readonly<Record<string, LogAttribute>>,
	): void {
		this.log("error", eventName, { error, attributes })
	}
	public fatal(
		eventName: string,
		error?: unknown,
		attributes?: Readonly<Record<string, LogAttribute>>,
	): void {
		this.log("fatal", eventName, { error, attributes })
	}
	public operation<T>(
		eventName: string,
		values: LogValues | Readonly<Record<string, LogAttribute>>,
		operation: () => Promise<T>,
	): Promise<T> {
		return this.logger.operation(eventName, values, operation, this.bindings)
	}
}

function normalizeValues(values: LogValues): {
	message?: string
	outcome?: LogOutcome
	durationMs?: number
	error?: ReturnType<typeof serializeError>
	attributes?: Readonly<Record<string, LogAttribute>>
	audit?: boolean
} {
	return {
		...(values.message === undefined ? {} : { message: safeText(values.message, 2_048) }),
		...(values.outcome === undefined ? {} : { outcome: values.outcome }),
		...(values.durationMs === undefined
			? {}
			: { durationMs: Math.max(0, Math.round(values.durationMs)) }),
		...(values.error === undefined ? {} : { error: serializeError(values.error) }),
		...(values.attributes === undefined
			? {}
			: { attributes: sanitizeAttributes(values.attributes) }),
		...(values.audit === true ? { audit: true } : {}),
	}
}

function safeText(value: string, maxLength: number): string {
	return value
		.replace(/[\r\n]/g, " ")
		.replaceAll(String.fromCharCode(0), " ")
		.slice(0, maxLength)
}

function isLogValues(
	value: LogValues | Readonly<Record<string, LogAttribute>>,
): value is LogValues {
	return Object.keys(value).some(
		(key) =>
			key === "message" ||
			key === "outcome" ||
			key === "durationMs" ||
			key === "error" ||
			key === "attributes" ||
			key === "audit",
	)
}
