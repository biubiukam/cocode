import { sanitizeSingleLine } from './text-format.ts'

export type StatusTone = 'info' | 'error'

export function formatNoticeLine(
  notice: { tone: StatusTone; message: string } | undefined,
  maxColumns = 80,
): string | undefined {
  if (notice === undefined) return undefined
  const prefix = notice.tone === 'error' ? '! ' : '· '
  const content = sanitizeSingleLine(notice.message)
  if (content === '') return prefix.trimEnd()
  const available = Math.max(1, Math.trunc(maxColumns) - prefix.length)
  return `${prefix}${truncateLine(content, available)}`
}

export function truncateLine(value: string, maxColumns: number): string {
  const limit = Math.max(1, Math.trunc(maxColumns))
  if (value.length <= limit) return value
  if (limit === 1) return '…'
  return `${value.slice(0, limit - 1)}…`
}
