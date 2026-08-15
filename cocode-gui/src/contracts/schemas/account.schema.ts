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
		providerId: z.literal("cocode-cloud"),
	}),
	error: z.object({ code: z.string(), message: z.string() }).optional(),
})

export function parseAccountSnapshot(value: unknown): AccountSnapshot {
	return accountSnapshotSchema.parse(value) as AccountSnapshot
}
