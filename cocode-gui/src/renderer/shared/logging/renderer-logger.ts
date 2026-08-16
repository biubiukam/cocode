import type {
	DiagnosticsLogAttribute,
	DiagnosticsLogLevel,
	RendererLogRecordDto,
} from "../../../contracts/ipc/diagnostics.contract"

const FLUSH_INTERVAL_MS = 250
const MAX_BATCH_SIZE = 50
const MAX_QUEUE_SIZE = 2_000
const MAX_RECORD_BYTES = 16 * 1024
const MAX_BATCH_BYTES = 256 * 1024

export class RendererLogger {
	private readonly queue: RendererLogRecordDto[] = []
	private flushTimer: number | undefined

	public log(
		level: DiagnosticsLogLevel,
		eventName: string,
		values: RendererLogValues = {},
	): void {
		const record: RendererLogRecordDto = {
			level,
			eventName: clampText(eventName, 128),
			...(values.message === undefined ? {} : { message: clampText(values.message, 2_048) }),
			...(values.component === undefined
				? {}
				: { component: clampText(values.component, 128) }),
			...(values.operation === undefined
				? {}
				: { operation: clampText(values.operation, 128) }),
			...(values.outcome === undefined ? {} : { outcome: values.outcome }),
			...(values.durationMs === undefined ? {} : { durationMs: values.durationMs }),
			...(values.correlationId === undefined
				? {}
				: { correlationId: clampText(values.correlationId, 128) }),
			...(values.attributes === undefined
				? {}
				: { attributes: compactAttributes(values.attributes) }),
		}
		this.enqueue(record)
		if (
			level === "warn" ||
			level === "error" ||
			level === "fatal" ||
			this.queue.length >= MAX_BATCH_SIZE
		) {
			this.flush()
			return
		}
		this.scheduleFlush()
	}

	public info(
		eventName: string,
		attributes?: Readonly<Record<string, DiagnosticsLogAttribute>>,
	): void {
		this.log("info", eventName, { attributes })
	}

	public warn(eventName: string, values?: RendererLogValues): void {
		this.log("warn", eventName, values)
	}

	public error(
		eventName: string,
		error?: unknown,
		attributes?: Readonly<Record<string, DiagnosticsLogAttribute>>,
	): void {
		this.log("error", eventName, { message: errorMessage(error), attributes })
	}

	public flush(): void {
		if (this.flushTimer !== undefined) {
			window.clearTimeout(this.flushTimer)
			this.flushTimer = undefined
		}
		if (this.queue.length === 0) return
		const batch: RendererLogRecordDto[] = []
		let bytes = 2
		while (batch.length < MAX_BATCH_SIZE && this.queue.length > 0) {
			const next = this.queue[0]
			const nextBytes = byteLength(next)
			if (batch.length > 0 && bytes + nextBytes > MAX_BATCH_BYTES) break
			this.queue.shift()
			if (nextBytes <= MAX_RECORD_BYTES) {
				batch.push(next)
				bytes += nextBytes
			}
		}
		try {
			window.desktopApi?.diagnostics.log.writeBatch(batch)
		} catch {
			// Diagnostics must never break the Renderer.
		}
		if (this.queue.length > 0) this.flush()
	}

	private scheduleFlush(): void {
		if (this.flushTimer !== undefined) return
		this.flushTimer = window.setTimeout(() => this.flush(), FLUSH_INTERVAL_MS)
	}

	private enqueue(record: RendererLogRecordDto): void {
		if (this.queue.length >= MAX_QUEUE_SIZE) {
			if (record.level === "trace" || record.level === "debug") return
			const index = this.queue.findIndex(
				(entry) => entry.level === "trace" || entry.level === "debug",
			)
			if (index >= 0) this.queue.splice(index, 1)
			else this.queue.shift()
		}
		this.queue.push(record)
	}
}

export interface RendererLogValues {
	readonly message?: string
	readonly component?: string
	readonly operation?: string
	readonly outcome?: "started" | "success" | "failure" | "cancelled" | "degraded"
	readonly durationMs?: number
	readonly correlationId?: string
	readonly attributes?: Readonly<Record<string, DiagnosticsLogAttribute>>
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`
	return typeof error === "string" ? error : String(error)
}

function clampText(value: string, max: number): string {
	return value
		.replace(/[\r\n]/g, " ")
		.replaceAll(String.fromCharCode(0), " ")
		.slice(0, max)
}

function compactAttributes(
	attributes: Readonly<Record<string, DiagnosticsLogAttribute>>,
): Readonly<Record<string, DiagnosticsLogAttribute>> {
	const result: Record<string, DiagnosticsLogAttribute> = {}
	for (const [key, value] of Object.entries(attributes).slice(0, 64)) {
		if (value === undefined) continue
		result[clampText(key, 128)] = typeof value === "string" ? clampText(value, 4_096) : value
	}
	return result
}

function byteLength(value: unknown): number {
	try {
		return new TextEncoder().encode(JSON.stringify(value)).byteLength
	} catch {
		return MAX_RECORD_BYTES + 1
	}
}
