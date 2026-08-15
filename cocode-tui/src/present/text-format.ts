/**
 * Display-only truncation. Conversation nodes retain their full text.
 */

const RESULT_PREVIEW_CHARS = 80
const VERBOSE_RESULT_LINES = 40
const STREAMING_REASONING_LINES = 24

export function formatReasoning(
  text: string,
  verbose: boolean,
  streaming: boolean,
): string | undefined {
  if (text === '') return undefined
  // Keep the active reasoning visible so the user can tell the model is making
  // progress. Once the assistant message is sealed, the default view folds it
  // back to a compact summary; verbose mode still keeps it expanded.
  if (verbose) return text
  if (streaming) return reasoningTail(text, STREAMING_REASONING_LINES)
  return `thinking · ${text.length} chars`
}

export function reasoningTail(value: string, maxLines = STREAMING_REASONING_LINES): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const limit = Math.max(1, Math.trunc(maxLines))
  if (lines.length <= limit) return value
  return `… ${lines.length - limit} earlier lines hidden\n${lines.slice(-limit).join('\n')}`
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

export function sanitizeSingleLine(text: string): string {
  return (
    text
      // ANSI and control characters must not reach the terminal renderer.
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function normalizeLines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}
