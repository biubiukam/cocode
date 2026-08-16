import type { SerializedError } from "./log-types"

const MAX_MESSAGE_LENGTH = 2_048
const MAX_STACK_LENGTH = 8_192

export function serializeError(error: unknown): SerializedError {
	if (error instanceof Error) {
		const errorWithCode = error as Error & { code?: unknown }
		return {
			name: safeText(error.name, 256),
			message: safeText(error.message, MAX_MESSAGE_LENGTH),
			...(typeof errorWithCode.code === "string"
				? { code: safeText(errorWithCode.code, 128) }
				: {}),
			...(error.stack === undefined
				? {}
				: { stack: safeText(error.stack, MAX_STACK_LENGTH) }),
			...(error.cause === undefined
				? {}
				: { causeSummary: safeText(errorSummary(error.cause), 512) }),
		}
	}

	return {
		name: "NonErrorThrownValue",
		message: safeText(errorSummary(error), MAX_MESSAGE_LENGTH),
	}
}

function errorSummary(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`
	if (typeof error === "string") return error
	try {
		return JSON.stringify(error)
	} catch {
		return String(error)
	}
}

function safeText(value: string, maxLength: number): string {
	return value
		.replace(/[\r\n]/g, " ")
		.replaceAll(String.fromCharCode(0), " ")
		.replace(/((?:https?|wss?):\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, "$1")
		.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
		.replace(
			/("(?:prompt|content|arguments|tool(?:_name)?|output|token|secret|password|api[-_]?key)"\s*:\s*)"[^"]*"/gi,
			'$1"[REDACTED]"',
		)
		.replace(
			/\b(?:prompt|content|arguments|tool(?:_name)?|output)\s*[:=]\s*[^\s,;]+/gi,
			"[REDACTED]",
		)
		.replace(
			/(\b(?:password|passwd|token|secret|api[-_ ]?key|authorization))\s*[:=]\s*[^\s,;]+/gi,
			"$1=[REDACTED]",
		)
		.replace(/(?:\/Users\/|\/home\/)[^/\s]+/g, "<user-home>")
		.replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s]+/g, "<user-home>")
		.slice(0, maxLength)
}
