import { z } from "zod"
import type {
	ShortcutConflictDto,
	SyncShortcutsRequest,
	SyncShortcutsResult,
} from "../ipc/shortcuts.contract"

const globalBindingSchema = z.object({
	commandId: z
		.string()
		.min(1)
		.max(128)
		.regex(/^[A-Za-z0-9._:-]+$/),
	accelerator: z.string().min(1).max(128),
})

const syncShortcutsRequestSchema = z.object({
	bindings: z.array(globalBindingSchema).max(64),
})

const conflictSchema = z.object({
	accelerator: z.string(),
	reason: z.string(),
})

const syncShortcutsResultSchema = z.object({
	ok: z.boolean(),
	conflicts: z.array(conflictSchema).optional(),
})

export function parseSyncShortcutsRequest(value: unknown): SyncShortcutsRequest {
	return syncShortcutsRequestSchema.parse(value) as SyncShortcutsRequest
}

export function parseSyncShortcutsResult(value: unknown): SyncShortcutsResult {
	return syncShortcutsResultSchema.parse(value) as SyncShortcutsResult
}

export function parseTriggeredShortcutCommandId(value: unknown): string {
	return z
		.string()
		.min(1)
		.max(128)
		.regex(/^[A-Za-z0-9._:-]+$/)
		.parse(value)
}

export function parseShortcutConflict(value: unknown): ShortcutConflictDto {
	return conflictSchema.parse(value) as ShortcutConflictDto
}
