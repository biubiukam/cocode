import { app } from "electron"
import { readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "pathe"
import type { DefaultSelection } from "./dsh-cloud-config-port"

/**
 * Logout cleanup is deliberately recoverable. The marker only records the
 * default selection to restore; it never contains an identity token or an API
 * key. Route ownership is not recorded here: the reserved Cocode route id and
 * credential reference identify the managed configuration on their own, so a
 * stale marker can never make cleanup skip a route it owns.
 */
export type CleanupPendingState = {
	readonly pending: true
	readonly previousDefault?: DefaultSelection
}

const FILENAME = "cocode-account-cleanup-pending.json"

export class CleanupPendingStore {
	private readonly path = join(app.getPath("userData"), FILENAME)

	async read(): Promise<CleanupPendingState | undefined> {
		try {
			const value: unknown = JSON.parse(await readFile(this.path, "utf8"))
			if (!isRecord(value)) return undefined
			const previousDefault = readDefault(value.previousDefault)
			if (value.pending !== true) return undefined
			return {
				pending: true,
				...(previousDefault === undefined ? {} : { previousDefault }),
			}
		} catch {
			return undefined
		}
	}

	async write(value: CleanupPendingState): Promise<void> {
		await writeFile(this.path, JSON.stringify(value), { mode: 0o600 })
	}

	async clear(): Promise<void> {
		try {
			await unlink(this.path)
		} catch {
			// Idempotent cleanup.
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readDefault(value: unknown): DefaultSelection | undefined {
	if (!isRecord(value) || typeof value.provider !== "string" || typeof value.model !== "string")
		return undefined
	return {
		provider: value.provider,
		model: value.model,
		...(typeof value.reasoningEffort === "string"
			? { reasoningEffort: value.reasoningEffort }
			: {}),
	}
}
