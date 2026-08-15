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
  // Keep the active reasoning visible so the user can tell the model is making
  // progress. Once the assistant message is sealed, the default view folds it
  // back to a compact summary; verbose mode still keeps it expanded.
  if (verbose || streaming) return text
  return `thinking · ${text.length} chars`
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
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function normalizeLines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}
