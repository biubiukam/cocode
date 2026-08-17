/** Pure row projection for the multiline composer. */

import stringWidth from 'string-width'
import {
  graphemeSegments,
  normalizeGraphemeOffset,
} from '../runtime/grapheme.ts'

export type ComposerSpan = {
  text: string
  selected?: boolean
  cursor?: boolean
}

export type ComposerRow = {
  spans: ComposerSpan[]
  /** Cursor sits after the last cell; used when the hardware caret is shown. */
  caretAtEnd?: boolean
}

/** Number of input rows that the borderless composer visibly reserves. */
export function composerInputRows(text: string, maxRows = 6): number {
  const lineCount = text.split('\n').length
  return Math.min(Math.max(1, Math.trunc(maxRows)), Math.max(1, lineCount))
}

/** Cells occupied by the first-line `> ` / continuation `│ ` marker. */
export const COMPOSER_PROMPT_PREFIX_CELLS = 2
const COMPOSER_METADATA_ROWS = 1

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
    COMPOSER_METADATA_ROWS
  )
}

export type ComposerImeCaret = {
  /** 0-based row inside the visible input box. */
  rowIndex: number
  /** 0-based column inside the input box, including the prompt marker. */
  column: number
}

/** Caret offset inside the composer input box for Ink's native IME cursor. */
export function composerImeCaret(options: {
  text: string
  cursor: number
  selection?: { start: number; end: number }
  maxInputRows: number
  maxColumns: number
}): ComposerImeCaret {
  const inputRows =
    options.text === ''
      ? []
      : visibleComposerRows(
          renderComposerRows(options.text, options.cursor, options.selection, {
            caretCell: false,
          }),
          options.maxInputRows,
        ).map((row) =>
          clipComposerRow(
            row,
            Math.max(
              1,
              Math.trunc(options.maxColumns) - COMPOSER_PROMPT_PREFIX_CELLS,
            ),
          ),
        )
  const cursorRow = inputRows.findIndex(hasCursor)
  const rowIndex = cursorRow < 0 ? 0 : cursorRow
  const row = inputRows[rowIndex]
  const cursorSpanIndex =
    row?.spans.findIndex((span) => span.cursor === true) ?? -1
  const beforeCursor =
    row === undefined
      ? 0
      : row.caretAtEnd === true || cursorSpanIndex < 0
        ? spansWidth(row.spans)
        : spansWidth(row.spans.slice(0, cursorSpanIndex))
  const maxColumn = Math.max(0, Math.trunc(options.maxColumns) - 1)
  return {
    rowIndex,
    column: Math.min(COMPOSER_PROMPT_PREFIX_CELLS + beforeCursor, maxColumn),
  }
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
  options?: { caretCell?: boolean },
): ComposerRow[] {
  const caretCell = options?.caretCell !== false
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
    let caretAtEnd = false
    if (!cursorRendered && safeCursor === lineEnd) {
      if (caretCell) appendSpan(spans, { text: ' ', cursor: true })
      else caretAtEnd = true
      cursorRendered = true
    }
    rows.push(caretAtEnd ? { spans, caretAtEnd: true } : { spans })
    offset = lineEnd + 1
  }
  return rows
}

export function visibleComposerRows(
  rows: readonly ComposerRow[],
  maxRows: number,
): ComposerRow[] {
  const size = Math.max(1, Math.trunc(maxRows))
  if (rows.length <= size) return [...rows]
  const cursorIndex = Math.max(0, rows.findIndex(hasCursor))
  const start = Math.max(
    0,
    Math.min(cursorIndex - size + 1, rows.length - size),
  )
  return rows.slice(start, start + size)
}

export function clipComposerRow(
  row: ComposerRow,
  maxCells: number,
): ComposerRow {
  const width = Math.max(1, Math.trunc(maxCells))
  if (rowWidth(row) <= width) return row

  const cursorIndex = row.spans.findIndex((span) => span.cursor === true)
  if (cursorIndex < 0) {
    return {
      spans:
        row.caretAtEnd === true
          ? clipSpansEnd(row.spans, width)
          : clipSpansStart(row.spans, width),
      ...(row.caretAtEnd === true ? { caretAtEnd: true } : {}),
    }
  }

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
    ...(row.caretAtEnd === true ? { caretAtEnd: true } : {}),
  }
}

export function composerRowText(row: ComposerRow): string {
  return row.spans.map((span) => span.text).join('')
}

function hasCursor(row: ComposerRow): boolean {
  return (
    row.caretAtEnd === true || row.spans.some((span) => span.cursor === true)
  )
}

function rowWidth(row: ComposerRow): number {
  return spansWidth(row.spans)
}

function spansWidth(spans: readonly ComposerSpan[]): number {
  return stringWidth(spans.map((span) => span.text).join(''))
}

function clipSpansStart(
  spans: readonly ComposerSpan[],
  maxCells: number,
): ComposerSpan[] {
  if (spansWidth(spans) <= maxCells) return [...spans]
  if (maxCells <= 0) return []
  if (maxCells === 1) return [{ text: '…' }]
  return [...takeSpanGraphemes(spans, maxCells - 1, false), { text: '…' }]
}

function clipSpansEnd(
  spans: readonly ComposerSpan[],
  maxCells: number,
): ComposerSpan[] {
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
  const end = Math.max(
    start,
    normalizeGraphemeOffset(text, selection.end, 'next'),
  )
  return start === end ? undefined : { start, end }
}

function isSelected(
  index: number,
  selection: ComposerSelection | undefined,
): boolean {
  return (
    selection !== undefined && index >= selection.start && index < selection.end
  )
}
