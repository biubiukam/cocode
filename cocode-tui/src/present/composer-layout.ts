/** Pure row projection for the multiline composer. */

import stringWidth from 'string-width'
import { graphemeSegments, normalizeGraphemeOffset } from '../runtime/grapheme.ts'

export type ComposerSpan = {
  text: string
  selected?: boolean
  cursor?: boolean
}

export type ComposerRow = {
  spans: ComposerSpan[]
}

/** Number of input rows that the borderless composer visibly reserves. */
export function composerInputRows(text: string, maxRows = 6): number {
  const lineCount = text.split('\n').length
  return Math.min(Math.max(1, Math.trunc(maxRows)), Math.max(1, lineCount))
}

/** Complete borderless composer height: input, optional summaries, and metadata. */
export function composerRenderedRows(options: {
  text: string
  maxRows?: number
  hasAttachments?: boolean
  hasImages?: boolean
}): number {
  return (
    composerInputRows(options.text, options.maxRows) +
    Number(options.hasAttachments === true) +
    Number(options.hasImages === true) +
    1
  )
}

export function composerCursorStyle(
  appleTerminal: boolean,
  disabled: boolean,
): { inverse: boolean; underline: boolean } {
  return {
    inverse: !appleTerminal && !disabled,
    underline: appleTerminal && !disabled,
  }
}

type ComposerSelection = {
  start: number
  end: number
}

export function renderComposerRows(
  text: string,
  cursor: number,
  selection?: ComposerSelection,
): ComposerRow[] {
  const safeCursor = normalizeGraphemeOffset(text, cursor)
  const safeSelection = normalizeSelection(selection, text)
  const rows: ComposerRow[] = []
  let cursorRendered = false
  let offset = 0

  for (const line of text.split('\n')) {
    const lineEnd = offset + line.length
    const spans: ComposerSpan[] = []
    for (const entry of graphemeSegments(line)) {
      const absoluteIndex = offset + entry.index
      const isCursor = !cursorRendered && safeCursor === absoluteIndex
      appendSpan(spans, {
        text: entry.segment,
        ...(isSelected(absoluteIndex, safeSelection) ? { selected: true } : {}),
        ...(isCursor ? { cursor: true } : {}),
      })
      if (isCursor) cursorRendered = true
    }
    if (!cursorRendered && safeCursor === lineEnd) {
      appendSpan(spans, { text: ' ', cursor: true })
      cursorRendered = true
    }
    rows.push({ spans })
    offset = lineEnd + 1
  }
  return rows
}

export function visibleComposerRows(rows: readonly ComposerRow[], maxRows: number): ComposerRow[] {
  const size = Math.max(1, Math.trunc(maxRows))
  if (rows.length <= size) return [...rows]
  const cursorIndex = Math.max(0, rows.findIndex(hasCursor))
  const start = Math.max(0, Math.min(cursorIndex - size + 1, rows.length - size))
  return rows.slice(start, start + size)
}

export function clipComposerRow(row: ComposerRow, maxCells: number): ComposerRow {
  const width = Math.max(1, Math.trunc(maxCells))
  if (rowWidth(row) <= width) return row

  const cursorIndex = row.spans.findIndex((span) => span.cursor === true)
  if (cursorIndex < 0) return { spans: clipSpansStart(row.spans, width) }

  const cursor = row.spans[cursorIndex]
  if (cursor === undefined) return row
  const before = row.spans.slice(0, cursorIndex)
  const after = row.spans.slice(cursorIndex + 1)
  const cursorWidth = Math.max(1, stringWidth(cursor.text))
  const textBudget = Math.max(0, width - cursorWidth)
  let beforeBudget = Math.min(spansWidth(before), Math.ceil(textBudget / 2))
  let afterBudget = Math.min(spansWidth(after), textBudget - beforeBudget)
  let remaining = textBudget - beforeBudget - afterBudget
  const addBefore = Math.min(remaining, spansWidth(before) - beforeBudget)
  beforeBudget += addBefore
  remaining -= addBefore
  afterBudget += Math.min(remaining, spansWidth(after) - afterBudget)

  return {
    spans: [
      ...clipSpansEnd(before, beforeBudget),
      cursor,
      ...clipSpansStart(after, afterBudget),
    ],
  }
}

export function composerRowText(row: ComposerRow): string {
  return row.spans.map((span) => span.text).join('')
}

function hasCursor(row: ComposerRow): boolean {
  return row.spans.some((span) => span.cursor === true)
}

function rowWidth(row: ComposerRow): number {
  return spansWidth(row.spans)
}

function spansWidth(spans: readonly ComposerSpan[]): number {
  return stringWidth(spans.map((span) => span.text).join(''))
}

function clipSpansStart(spans: readonly ComposerSpan[], maxCells: number): ComposerSpan[] {
  if (spansWidth(spans) <= maxCells) return [...spans]
  if (maxCells <= 0) return []
  if (maxCells === 1) return [{ text: '…' }]
  return [...takeSpanGraphemes(spans, maxCells - 1, false), { text: '…' }]
}

function clipSpansEnd(spans: readonly ComposerSpan[], maxCells: number): ComposerSpan[] {
  if (spansWidth(spans) <= maxCells) return [...spans]
  if (maxCells <= 0) return []
  if (maxCells === 1) return [{ text: '…' }]
  return [{ text: '…' }, ...takeSpanGraphemes(spans, maxCells - 1, true)]
}

function takeSpanGraphemes(
  spans: readonly ComposerSpan[],
  maxCells: number,
  fromEnd: boolean,
): ComposerSpan[] {
  const graphemes = spans.flatMap((span) =>
    graphemeSegments(span.text).map((entry) => ({
      text: entry.segment,
      ...(span.selected === true ? { selected: true } : {}),
      ...(span.cursor === true ? { cursor: true } : {}),
    })),
  )
  const source = fromEnd ? [...graphemes].reverse() : graphemes
  const visible: ComposerSpan[] = []
  let cells = 0
  for (const grapheme of source) {
    const next = stringWidth(grapheme.text)
    if (cells + next > maxCells) break
    visible.push(grapheme)
    cells += next
  }
  if (fromEnd) visible.reverse()
  return coalesceSpans(visible)
}

function coalesceSpans(spans: readonly ComposerSpan[]): ComposerSpan[] {
  return spans.reduce<ComposerSpan[]>((result, span) => {
    appendSpan(result, span)
    return result
  }, [])
}

function appendSpan(spans: ComposerSpan[], span: ComposerSpan): void {
  if (span.text === '') return
  const previous = spans.at(-1)
  if (
    previous !== undefined &&
    previous.selected === span.selected &&
    previous.cursor !== true &&
    span.cursor !== true
  ) {
    previous.text += span.text
    return
  }
  spans.push({ ...span })
}

function normalizeSelection(
  selection: ComposerSelection | undefined,
  text: string,
): ComposerSelection | undefined {
  if (selection === undefined) return undefined
  if (selection.start === selection.end) return undefined
  const start = normalizeGraphemeOffset(text, selection.start, 'previous')
  const end = Math.max(start, normalizeGraphemeOffset(text, selection.end, 'next'))
  return start === end ? undefined : { start, end }
}

function isSelected(index: number, selection: ComposerSelection | undefined): boolean {
  return selection !== undefined && index >= selection.start && index < selection.end
}
