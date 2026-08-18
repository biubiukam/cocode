import type { LogAttribute, RendererLogRecordDto } from "./log-types"

const SENSITIVE_KEY =
	/(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|oauth|client[-_]?secret|private[-_]?key|prompt|completion|response|body|headers?|args?|output|clipboard|env)/i
const SENSITIVE_CONTENT =
	/\b(?:prompt|completion|assistant\s+(?:message|response)|model\s+(?:response|output)|tool\s+(?:input|output|arguments?)|clipboard\s+contents?|password|token|api[-_]?key)\b/i
const MAX_STRING_LENGTH = 4_096
const MAX_ATTRIBUTES = 64

export function sanitizeAttributes(
	attributes: Readonly<Record<string, LogAttribute>> | undefined,
): Readonly<Record<string, LogAttribute>> | undefined {
	if (attributes === undefined) return undefined
	const sanitized: Record<string, LogAttribute> = {}
	for (const [key, value] of Object.entries(attributes).slice(0, MAX_ATTRIBUTES)) {
		if (SENSITIVE_KEY.test(key)) {
			sanitized[key] = "[REDACTED]"
			continue
		}
		sanitized[key] = sanitizeValue(value)
	}
	return sanitized
}

export function sanitizeRendererRecord(record: RendererLogRecordDto): RendererLogRecordDto {
	return {
		...record,
		eventName: sanitizeText(record.eventName, 128),
		...(record.message === undefined ? {} : { message: sanitizeText(record.message, 2_048) }),
		...(record.component === undefined
			? {}
			: { component: sanitizeText(record.component, 128) }),
		...(record.operation === undefined
			? {}
			: { operation: sanitizeText(record.operation, 128) }),
		...(record.attributes === undefined
			? {}
			: { attributes: sanitizeAttributes(record.attributes) }),
	}
}

export function sanitizePath(value: string): string {
	return value
		.replace(/\\/g, "/")
		.replace(/(^|\/)\.dsh(?=\/|$)/g, "$1<dsh-home>")
		.replace(/(^|\/)workspaces\/[^/]+(?=\/|$)/g, "$1<workspace>")
		.replace(/\/Users\/[^/]+/g, "<user-home>")
		.replace(/\/home\/[^/]+/g, "<user-home>")
		.replace(/[A-Za-z]:\/Users\/[^/]+/gi, "<user-home>")
}

function sanitizeValue(value: LogAttribute): LogAttribute {
	if (typeof value !== "string") return value
	return sanitizeText(value, MAX_STRING_LENGTH)
}

function sanitizeText(value: string, maxLength: number): string {
	const cleaned = value
		.replace(/[\r\n]/g, " ")
		.replaceAll(String.fromCharCode(0), " ")
		.replace(/((?:https?|wss?):\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, "$1")
	const safe = sanitizePath(cleaned)
	return SENSITIVE_CONTENT.test(safe) ? "[REDACTED]" : safe.slice(0, maxLength)
}
