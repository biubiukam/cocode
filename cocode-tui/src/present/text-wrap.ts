import wrapAnsi from 'wrap-ansi'

export type WrappedLine = {
  start: number
  end: number
  /** Visual cells before this slice, e.g. a list bullet. */
  indent?: number
}

/** Wrap like Ink Text wrap="wrap": wrap-ansi hard, keep spaces. */
export function wrapPlainText(text: string, columns: number): WrappedLine[] {
  const width = Math.max(1, Math.trunc(columns))
  const wrapped = wrapAnsi(text, width, { trim: false, hard: true })
  return visualLinesToOffsets(text, wrapped)
}

export function countWrappedRows(text: string | undefined, columns?: number): number {
  if (text === undefined || text === '') return 0
  const normalized = text.replace(/\r\n?/g, '\n')
  if (columns === undefined) return normalized.split('\n').length
  return wrapPlainText(normalized, columns).length
}

function visualLinesToOffsets(original: string, wrapped: string): WrappedLine[] {
  const lines: WrappedLine[] = []
  let origin = 0
  for (const visual of wrapped.split('\n')) {
    if (visual === '') {
      lines.push({ start: origin, end: origin })
      if (original.startsWith('\n', origin)) origin += 1
      continue
    }
    const start = original.startsWith(visual, origin)
      ? origin
      : original.indexOf(visual, origin)
    if (start < 0) {
      lines.push({ start: origin, end: origin + visual.length })
      origin += visual.length
      continue
    }
    lines.push({ start, end: start + visual.length })
    origin = start + visual.length
    if (original.startsWith('\n', origin)) origin += 1
  }
  return lines.length === 0 ? [{ start: 0, end: original.length }] : lines
}
