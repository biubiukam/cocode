import path from "node:path"
import { z } from "zod"
import type { OpenLocalFileRequest } from "../ipc/local-files.contract"

const openLocalFileRequestSchema = z.object({
	path: z
		.string()
		.trim()
		.min(1)
		.max(32_768)
		.refine((value) => path.isAbsolute(value), {
			message: "Local file path must be absolute",
		}),
})

export function parseOpenLocalFileRequest(value: unknown): OpenLocalFileRequest {
	return openLocalFileRequestSchema.parse(value) as OpenLocalFileRequest
}
