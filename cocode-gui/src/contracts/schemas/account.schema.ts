import { z } from "zod"
import type { AccountSnapshot } from "../ipc/account.contract"

const accountProfileSchema = z.object({
	displayName: z.string(),
	email: z.string().optional(),
	avatarUrl: z.string().optional(),
})

const accountSnapshotSchema = z.object({
	phase: z.enum(["signed-out", "signing-in", "provisioning", "signed-in", "error"]),
	profile: accountProfileSchema.nullable(),
	cloud: z.object({
		status: z.enum(["absent", "ready", "conflict", "error"]),
		providerId: z.literal("cocode-nut"),
	}),
	usage: z
		.object({
			plan: z.string().optional(),
			fiveHour: z.number().min(0).max(100).optional(),
			week: z.number().min(0).max(100).optional(),
			month: z.number().min(0).max(100).optional(),
			currentPeriodEnd: z.string().optional(),
			fiveHourResetAt: z.string().optional(),
			weekResetAt: z.string().optional(),
			syncedAt: z.string().optional(),
			error: z.string().optional(),
		})
		.optional(),
	error: z.object({ code: z.string(), message: z.string() }).optional(),
})

export function parseAccountSnapshot(value: unknown): AccountSnapshot {
	return accountSnapshotSchema.parse(value) as AccountSnapshot
}
