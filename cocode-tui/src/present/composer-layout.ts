/** Pure row projection for the multiline composer. */

import stringWidth from 'string-width'

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export type ComposerRow = {
  before: string
  cursor?: string
  after: string
}

export function renderComposerRows(text: string, cursor: number): ComposerRow[] {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const rows: ComposerRow[] = []
  let cursorRendered = false
  let offset = 0
  for (const line of text.split('\n')) {
    const lineEnd = offset + line.length
    if (!cursorRendered && safeCursor <= lineEnd) {
      const position = safeCursor - offset
      rows.push({
        before: line.slice(0, position),
        cursor: line[position] ?? ' ',
        after: line.slice(position + (position < line.length ? 1 : 0)),
      })
      cursorRendered = true
    } else {
      rows.push({ before: line, after: '' })
    }
    offset = lineEnd + 1
  }
  return rows
}

export function visibleComposerRows(rows: readonly ComposerRow[], maxRows: number): ComposerRow[] {
  const size = Math.max(1, Math.trunc(maxRows))
  if (rows.length <= size) return [...rows]
  const cursorIndex = Math.max(
    0,
    rows.findIndex((row) => row.cursor !== undefined),
  )
  const start = Math.max(0, Math.min(cursorIndex - size + 1, rows.length - size))
  return rows.slice(start, start + size)
}

export function clipComposerRow(row: ComposerRow, maxCells: number): ComposerRow {
  const width = Math.max(1, Math.trunc(maxCells))
  if (row.cursor === undefined) {
    return { before: takeStart(row.before, width), after: '' }
  }
  if (stringWidth(row.before + row.cursor + row.after) <= width) return row

  const cursorWidth = Math.max(1, stringWidth(row.cursor))
  const textBudget = Math.max(0, width - cursorWidth)
  let beforeBudget = Math.min(stringWidth(row.before), Math.ceil(textBudget / 2))
  let afterBudget = Math.min(stringWidth(row.after), textBudget - beforeBudget)
  let remaining = textBudget - beforeBudget - afterBudget
  const addBefore = Math.min(remaining, stringWidth(row.before) - beforeBudget)
  beforeBudget += addBefore
  remaining -= addBefore
  afterBudget += Math.min(remaining, stringWidth(row.after) - afterBudget)

  return {
    before: takeEnd(row.before, beforeBudget),
    cursor: row.cursor,
    after: takeStart(row.after, afterBudget),
  }
}

function takeStart(value: string, maxCells: number): string {
  if (stringWidth(value) <= maxCells) return value
  if (maxCells <= 0) return ''
  if (maxCells === 1) return '…'
  return takeGraphemes(value, maxCells - 1, false) + '…'
}

function takeEnd(value: string, maxCells: number): string {
  if (stringWidth(value) <= maxCells) return value
  if (maxCells <= 0) return ''
  if (maxCells === 1) return '…'
  return '…' + takeGraphemes(value, maxCells - 1, true)
}

function takeGraphemes(value: string, maxCells: number, fromEnd: boolean): string {
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(value), (entry) => entry.segment)
  if (fromEnd) graphemes.reverse()
  const visible: string[] = []
  let cells = 0
  for (const grapheme of graphemes) {
    const next = stringWidth(grapheme)
    if (cells + next > maxCells) break
    visible.push(grapheme)
    cells += next
  }
  if (fromEnd) visible.reverse()
  return visible.join('')
}
