import { gunzipSync } from "node:zlib"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import * as path from "pathe"
import type {
	DiagnosticsLogAttribute,
	DiagnosticsLogQueryDto,
	DiagnosticsLogQueryResultDto,
	DiagnosticsLogRecordDto,
	DiagnosticsLogSourceDto,
} from "../../../contracts/ipc/diagnostics.contract"
import type { CocodeLogLayout } from "@cocode-agency/host-supervisor"

type LogSource = "desktop" | "audit" | "host" | "tui"

interface LogFile {
	readonly source: LogSource
	readonly absolutePath: string
	readonly relativePath: string
	readonly bytes: number
	readonly current: boolean
}

export interface LogQueryServiceOptions {
	readonly layout: CocodeLogLayout
	readonly legacyDirectories?: readonly string[]
}

export class LogQueryService {
	private readonly layout: CocodeLogLayout
	private readonly legacyDirectories: readonly string[]

	public constructor(options: LogQueryServiceOptions) {
		this.layout = options.layout
		this.legacyDirectories = options.legacyDirectories ?? []
	}

	public query(query: DiagnosticsLogQueryDto): DiagnosticsLogQueryResultDto {
		const files = this.files()
		const records: DiagnosticsLogRecordDto[] = []
		for (const file of files) {
			for (const record of readRecords(file)) {
				if (matches(record, query)) records.push(record)
			}
		}
		records.sort(compareRecords)

		const offset = decodeCursor(query.cursor)
		const limit = query.limit ?? 100
		const items = records.slice(offset, offset + limit)
		const nextOffset = offset + items.length
		return {
			items,
			scannedFiles: files.length,
			...(nextOffset < records.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
		}
	}

	public listSources(): readonly DiagnosticsLogSourceDto[] {
		return this.files().map((file) => ({
			source: file.source,
			relativePath: file.relativePath,
			bytes: file.bytes,
			current: file.current,
		}))
	}

	private files(): readonly LogFile[] {
		const files: LogFile[] = []
		collectFiles(this.layout.desktopApp, "desktop", path.join("desktop", "app"), files)
		collectFiles(this.layout.desktopAudit, "audit", path.join("desktop", "audit"), files)
		collectFiles(this.layout.host, "host", "host", files)
		collectFiles(this.layout.tui, "tui", "tui", files)
		for (const legacy of this.legacyDirectories) {
			const source: LogSource = legacy.includes(`${path.sep}host`) ? "host" : "desktop"
			collectFiles(legacy, source, path.join("legacy", path.basename(legacy)), files)
		}
		return files
	}
}

function collectFiles(
	directory: string,
	source: LogSource,
	relativeRoot: string,
	output: LogFile[],
): void {
	if (!existsSync(directory)) return
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name)
		if (entry.isDirectory()) {
			collectFiles(absolutePath, source, path.join(relativeRoot, entry.name), output)
			continue
		}
		if (
			!entry.isFile() ||
			(!entry.name.endsWith(".jsonl") && !entry.name.endsWith(".jsonl.gz"))
		)
			continue
		try {
			output.push({
				source,
				absolutePath,
				relativePath: path.join(relativeRoot, entry.name),
				bytes: statSync(absolutePath).size,
				current: entry.name === "current.jsonl",
			})
		} catch {
			// Files may disappear while a rotation is in progress.
		}
	}
}

function readRecords(file: LogFile): DiagnosticsLogRecordDto[] {
	let text: string
	try {
		const bytes = readFileSync(file.absolutePath)
		text = file.absolutePath.endsWith(".gz")
			? gunzipSync(bytes).toString("utf8")
			: bytes.toString("utf8")
	} catch {
		return []
	}

	const records: DiagnosticsLogRecordDto[] = []
	for (const line of text.split(/\r?\n/)) {
		if (line.trim() === "") continue
		try {
			const parsed: unknown = JSON.parse(line)
			const record = normalizeRecord(parsed, file.source)
			if (record !== undefined) records.push(record)
		} catch {
			// A torn final line must not make the remaining files unqueryable.
		}
	}
	return records
}

function normalizeRecord(value: unknown, source: LogSource): DiagnosticsLogRecordDto | undefined {
	if (
		!isRecord(value) ||
		typeof value.timestamp !== "string" ||
		typeof value.eventName !== "string"
	)
		return undefined
	return {
		timestamp: value.timestamp,
		eventName: value.eventName,
		source,
		...(typeof value.severityText === "string" ? { severityText: value.severityText } : {}),
		...(typeof value.message === "string" ? { message: value.message } : {}),
		...(typeof value.serviceName === "string" ? { serviceName: value.serviceName } : {}),
		...(typeof value.serviceVersion === "string"
			? { serviceVersion: value.serviceVersion }
			: {}),
		...(typeof value.appRunId === "string" ? { appRunId: value.appRunId } : {}),
		...(typeof value.eventId === "string" ? { eventId: value.eventId } : {}),
		...(typeof value.sequence === "number" ? { sequence: value.sequence } : {}),
		...(typeof value.processType === "string" ? { processType: value.processType } : {}),
		...(typeof value.component === "string" ? { component: value.component } : {}),
		...(typeof value.operation === "string" ? { operation: value.operation } : {}),
		...(typeof value.outcome === "string"
			? { outcome: value.outcome as DiagnosticsLogRecordDto["outcome"] }
			: {}),
		...(typeof value.durationMs === "number" ? { durationMs: value.durationMs } : {}),
		...(typeof value.correlationId === "string" ? { correlationId: value.correlationId } : {}),
		...(typeof value.traceId === "string" ? { traceId: value.traceId } : {}),
		...(typeof value.spanId === "string" ? { spanId: value.spanId } : {}),
		...(typeof value.hostKey === "string" ? { hostKey: value.hostKey } : {}),
		...(typeof value.sessionIdHash === "string" ? { sessionIdHash: value.sessionIdHash } : {}),
		...(isAttributeRecord(value.attributes) ? { attributes: value.attributes } : {}),
		...(isRecord(value.error) ? { error: normalizeError(value.error) } : {}),
	}
}

function normalizeError(value: Record<string, unknown>): DiagnosticsLogRecordDto["error"] {
	return {
		...(typeof value.name === "string" ? { name: value.name } : {}),
		...(typeof value.message === "string" ? { message: value.message } : {}),
		...(typeof value.code === "string" ? { code: value.code } : {}),
		...(typeof value.stack === "string" ? { stack: value.stack } : {}),
		...(typeof value.causeSummary === "string" ? { causeSummary: value.causeSummary } : {}),
	}
}

function matches(record: DiagnosticsLogRecordDto, query: DiagnosticsLogQueryDto): boolean {
	if (query.from !== undefined && record.timestamp < query.from) return false
	if (query.to !== undefined && record.timestamp > query.to) return false
	if (
		query.levels !== undefined &&
		!query.levels.includes(
			(record.severityText ?? "").toLowerCase() as NonNullable<
				DiagnosticsLogQueryDto["levels"]
			>[number],
		)
	)
		return false
	if (query.sources !== undefined && !query.sources.includes(record.source)) return false
	if (
		query.processTypes !== undefined &&
		!query.processTypes.includes(
			record.processType as NonNullable<DiagnosticsLogQueryDto["processTypes"]>[number],
		)
	)
		return false
	if (query.eventName !== undefined && !record.eventName.includes(query.eventName)) return false
	if (query.appRunId !== undefined && record.appRunId !== query.appRunId) return false
	if (query.hostKey !== undefined && record.hostKey !== query.hostKey) return false
	if (query.correlationId !== undefined && record.correlationId !== query.correlationId)
		return false
	if (query.sessionIdHash !== undefined && record.sessionIdHash !== query.sessionIdHash)
		return false
	if (query.text !== undefined && !searchableText(record).includes(query.text.toLowerCase()))
		return false
	return true
}

function searchableText(record: DiagnosticsLogRecordDto): string {
	return [
		record.eventName,
		record.message,
		record.component,
		record.operation,
		record.hostKey,
		record.correlationId,
		JSON.stringify(record.attributes),
	]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase()
}

function compareRecords(left: DiagnosticsLogRecordDto, right: DiagnosticsLogRecordDto): number {
	const time = right.timestamp.localeCompare(left.timestamp)
	if (time !== 0) return time
	const sequence = (right.sequence ?? 0) - (left.sequence ?? 0)
	if (sequence !== 0) return sequence
	return (right.eventId ?? "").localeCompare(left.eventId ?? "")
}

function encodeCursor(offset: number): string {
	return Buffer.from(`v1:${offset}`, "utf8").toString("base64url")
}

function decodeCursor(cursor: string | undefined): number {
	if (cursor === undefined) return 0
	try {
		const value = Buffer.from(cursor, "base64url").toString("utf8")
		if (!value.startsWith("v1:")) return 0
		const offset = Number(value.slice(3))
		return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
	} catch {
		return 0
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAttributeRecord(
	value: unknown,
): value is Readonly<Record<string, DiagnosticsLogAttribute>> {
	if (!isRecord(value)) return false
	return Object.values(value).every(
		(item) =>
			item === null ||
			typeof item === "string" ||
			typeof item === "number" ||
			typeof item === "boolean",
	)
}
