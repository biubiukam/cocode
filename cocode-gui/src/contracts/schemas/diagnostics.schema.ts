import { z } from "zod"
import type { RendererLogRecordDto, TemporaryDebugRequestDto } from "../ipc/diagnostics.contract"

const attributeSchema = z.union([z.string().max(4_096), z.number().finite(), z.boolean(), z.null()])

const rendererLogRecordSchema = z.object({
	level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
	eventName: z.string().min(1).max(128),
	message: z.string().max(2_048).optional(),
	component: z.string().max(128).optional(),
	operation: z.string().max(128).optional(),
	outcome: z.enum(["started", "success", "failure", "cancelled", "degraded"]).optional(),
	durationMs: z.number().finite().min(0).max(86_400_000).optional(),
	correlationId: z.string().max(128).optional(),
	attributes: z.record(z.string().max(128), attributeSchema).optional(),
})

const rendererLogBatchSchema = z.array(rendererLogRecordSchema).max(50)

const temporaryDebugSchema = z.object({ durationMinutes: z.union([z.literal(30), z.literal(60)]) })

export function parseRendererLogBatch(value: unknown): readonly RendererLogRecordDto[] {
	const records = rendererLogBatchSchema.parse(value) as readonly RendererLogRecordDto[]
	const recordSizes = records.map(
		(record) => new TextEncoder().encode(JSON.stringify(record)).byteLength,
	)
	if (recordSizes.some((size) => size > 16 * 1024)) {
		throw new Error("Renderer log record exceeds the 16 KiB limit")
	}
	if (recordSizes.reduce((total, size) => total + size, 2) > 256 * 1024) {
		throw new Error("Renderer log batch exceeds the 256 KiB limit")
	}
	return records
}

export function parseTemporaryDebugRequest(value: unknown): TemporaryDebugRequestDto {
	return temporaryDebugSchema.parse(value) as TemporaryDebugRequestDto
}
