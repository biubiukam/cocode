import type { DshRuntimeRequestDto } from "../../../../contracts/ipc/dsh-runtime.contract"

interface DshRuntimeFetchOptions {
	readonly target: URL
	readonly method: DshRuntimeRequestDto["method"]
	readonly headers: Headers
	readonly body: Uint8Array | undefined
	readonly signal: AbortSignal
	readonly onTransportFailure: (error: unknown) => void
	readonly fetchImpl?: typeof fetch
}

/**
 * Executes one allow-listed Runtime request and owns its transport-failure semantics.
 * Recovery may replace the failed Host, but the original request is never replayed:
 * a POST can reach the Host before its response connection disappears.
 */
export async function fetchDshRuntimeRequest(options: DshRuntimeFetchOptions): Promise<Response> {
	const fetchImpl = options.fetchImpl ?? fetch
	try {
		return await fetchImpl(options.target, {
			method: options.method,
			headers: options.headers,
			body: options.body,
			signal: options.signal,
		})
	} catch (error) {
		if (!options.signal.aborted) options.onTransportFailure(error)
		if (options.method === "POST" && !options.signal.aborted) {
			throw new Error(
				`OUTCOME_UNKNOWN: DSH runtime did not confirm whether the mutation was accepted (${errorMessage(
					error,
				)}).`,
			)
		}
		throw error
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
