/**
 * Display-only truncation. Conversation nodes retain their full text.
 */

const RESULT_PREVIEW_CHARS = 80
const VERBOSE_RESULT_LINES = 40
const STREAMING_REASONING_LINES = 24
const COLLAPSED_REASONING_LINES = 10
const EXPANDED_REASONING_LINES = 200

export function formatReasoning(
  text: string,
  verbose: boolean,
  streaming: boolean,
  thinkingDurationMs?: number,
  viewMode: 0 | 1 | 2 = 0,
): string | undefined {
  if (text === '') return undefined
  // Keep the active reasoning visible so the user can tell the model is making
  // progress. Once the assistant message is sealed, the default view folds it
  // back to a compact summary; verbose mode still keeps it expanded.
  if (verbose || viewMode === 2) return text
  const limit = streaming
    ? STREAMING_REASONING_LINES
    : viewMode === 1
      ? EXPANDED_REASONING_LINES
      : COLLAPSED_REASONING_LINES
  const visible = reasoningTail(text, limit)
  if (streaming) return visible
  const duration = formatThinkingDuration(thinkingDurationMs)
  return duration === undefined ? visible : `${visible}\n\nThought for ${duration}`
}

export function formatThinkingDuration(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) return undefined
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  const seconds = durationMs / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.round(seconds)}s`
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
