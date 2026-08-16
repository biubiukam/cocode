import type { SerializedError } from "../logging/log-types"

/** Reserved seam for a future consent-gated remote error platform. */
export interface RemoteErrorReporter {
	readonly captureException: (
		error: SerializedError,
		context?: Readonly<Record<string, string | number | boolean | null>>,
	) => void
	readonly flush: (timeoutMs?: number) => Promise<void>
}

/** First phase deliberately keeps all diagnostics local. */
export class NoopRemoteErrorReporter implements RemoteErrorReporter {
	public captureException(
		error: SerializedError,
		context?: Readonly<Record<string, string | number | boolean | null>>,
	): void {
		void error
		void context
	}
	public async flush(timeoutMs = 0): Promise<void> {
		void timeoutMs
	}
}
