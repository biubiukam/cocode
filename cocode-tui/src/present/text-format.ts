/**
 * Display-only truncation. Conversation nodes retain their full text.
 */

const RESULT_PREVIEW_CHARS = 80
const VERBOSE_RESULT_LINES = 40

export function formatReasoning(
  text: string,
  verbose: boolean,
  streaming: boolean,
): string | undefined {
  if (text === '') return undefined
  if (verbose) return text
  return `thinking · ${text.length} chars${streaming ? ' …' : ''}`
}

export function formatToolResult(text: string | undefined, verbose: boolean): string | undefined {
  if (text === undefined || text === '') return undefined
  const normalized = normalizeLines(text)
  if (!verbose) {
    return truncateText(normalized.split('\n', 1)[0] ?? '', RESULT_PREVIEW_CHARS)
  }
  const lines = normalized.split('\n')
  if (lines.length <= VERBOSE_RESULT_LINES) return normalized
  const hidden = lines.length - VERBOSE_RESULT_LINES
  return `${lines.slice(0, VERBOSE_RESULT_LINES).join('\n')}\n… +${hidden} lines`
}

export function truncateText(text: string, maxChars: number): string {
  const limit = Math.max(0, Math.trunc(maxChars))
  if (text.length <= limit) return text
  if (limit === 0) return ''
  if (limit === 1) return '…'
  return `${text.slice(0, limit - 1)}…`
}

function normalizeLines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}
