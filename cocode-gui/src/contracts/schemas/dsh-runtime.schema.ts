import { z } from "zod"
import type {
	DshBootEntryDto,
	DshBootManifestDto,
	DshRuntimeBootstrapDto,
	DshRuntimeRequestDto,
} from "../ipc/dsh-runtime.contract"

const dshBootEntrySchema = z.object({
	id: z.string().min(1),
	url: z.string().min(1),
	rev: z.string().min(1),
	inject: z.array(z.string()).optional(),
	immediately: z.boolean().optional(),
})

const dshBootManifestSchema = z.object({
	rev: z.string().min(1),
	entries: z.array(dshBootEntrySchema),
})

const dshRuntimeBootstrapSchema = z.object({
	origin: z.url(),
	boot: dshBootManifestSchema,
	themePreference: z.enum(["light", "dark", "system"]),
})

const headerTupleSchema = z.custom<readonly [string, string]>(
	(value) =>
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "string" &&
		value[0].length > 0 &&
		typeof value[1] === "string",
)

const dshRuntimeRequestSchema = z.object({
	requestId: z.uuid(),
	path: z.string().regex(/^\/(?:api|sidebar)(?:\/|\?|$)/),
	method: z.enum(["GET", "HEAD", "POST"]),
	headers: z.array(headerTupleSchema),
	body: z.instanceof(Uint8Array).optional(),
})

export function parseDshRuntimeBootstrap(value: unknown): DshRuntimeBootstrapDto {
	const parsed = dshRuntimeBootstrapSchema.parse(value)
	return parsed as DshRuntimeBootstrapDto
}

export function parseDshBootManifest(value: unknown): DshBootManifestDto {
	return dshBootManifestSchema.parse(value) as DshBootManifestDto
}

export function parseDshBootEntry(value: unknown): DshBootEntryDto {
	return dshBootEntrySchema.parse(value) as DshBootEntryDto
}

export function parseDshRuntimeRequest(value: unknown): DshRuntimeRequestDto {
	return dshRuntimeRequestSchema.parse(value)
}

export function parseDshRuntimeRequestId(value: unknown): string {
	return z.uuid().parse(value)
}
