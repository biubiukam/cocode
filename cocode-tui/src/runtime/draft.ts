/**
 * Pure draft editing over UTF-16 code units.
 */

export type DraftState = {
  text: string
  cursor: number
  selectionAnchor?: number
}

export type DraftSelection = {
  start: number
  end: number
}

export function createDraft(text = '', cursor = text.length): DraftState {
  return { text, cursor: clampCursor(cursor, text.length) }
}

export function replaceDraft(_state: DraftState, text: string, cursor = text.length): DraftState {
  return createDraft(text, cursor)
}

export function insertDraft(state: DraftState, input: string): DraftState {
  const text = filterPrintableInput(input)
  if (text === '') return normalizeDraft(state)
  const selection = selectedDraftRange(state)
  if (selection !== undefined) {
    return replaceDraftRange(state, selection.start, selection.end, text)
  }
  const cursor = clampCursor(state.cursor, state.text.length)
  return {
    text: state.text.slice(0, cursor) + text + state.text.slice(cursor),
    cursor: cursor + text.length,
  }
}

export function replaceDraftRange(
  state: DraftState,
  start: number,
  end: number,
  replacement: string,
): DraftState {
  const safeStart = clampCursor(start, state.text.length)
  const safeEnd = Math.max(safeStart, Math.min(Math.trunc(end), state.text.length))
  const text = state.text.slice(0, safeStart) + replacement + state.text.slice(safeEnd)
  return createDraft(text, safeStart + replacement.length)
}

export function insertNewline(state: DraftState): DraftState {
  return insertDraft(state, '\n')
}

export function moveDraftCursor(
  state: DraftState,
  delta: number,
  extendSelection = false,
): DraftState {
  const cursor = clampCursor(state.cursor, state.text.length)
  if (!extendSelection) {
    const selection = selectedDraftRange(state)
    if (selection !== undefined) {
      return createDraft(state.text, delta < 0 ? selection.start : selection.end)
    }
    return createDraft(state.text, cursor + Math.trunc(delta))
  }
  const selectionAnchor = clampCursor(state.selectionAnchor ?? cursor, state.text.length)
  const nextCursor = clampCursor(cursor + Math.trunc(delta), state.text.length)
  return {
    text: state.text,
    cursor: nextCursor,
    ...(nextCursor === selectionAnchor ? {} : { selectionAnchor }),
  }
}

export function backspaceDraft(state: DraftState): DraftState {
  const selection = selectedDraftRange(state)
  if (selection !== undefined) {
    return replaceDraftRange(state, selection.start, selection.end, '')
  }
  const cursor = clampCursor(state.cursor, state.text.length)
  if (cursor === 0) return { text: state.text, cursor }
  return {
    text: state.text.slice(0, cursor - 1) + state.text.slice(cursor),
    cursor: cursor - 1,
  }
}

export function selectAllDraft(state: DraftState): DraftState {
  if (state.text === '') return createDraft()
  return { text: state.text, cursor: state.text.length, selectionAnchor: 0 }
}

export function selectedDraftRange(state: DraftState): DraftSelection | undefined {
  if (state.selectionAnchor === undefined) return undefined
  const cursor = clampCursor(state.cursor, state.text.length)
  const anchor = clampCursor(state.selectionAnchor, state.text.length)
  if (cursor === anchor) return undefined
  return {
    start: Math.min(cursor, anchor),
    end: Math.max(cursor, anchor),
  }
}

export function selectedDraftText(state: DraftState): string {
  const selection = selectedDraftRange(state)
  return selection === undefined ? '' : state.text.slice(selection.start, selection.end)
}

export function deleteDraftSelection(state: DraftState): DraftState {
  const selection = selectedDraftRange(state)
  return selection === undefined
    ? normalizeDraft(state)
    : replaceDraftRange(state, selection.start, selection.end, '')
}

export function filterPrintableInput(input: string): string {
  let result = ''
  for (const char of input.replace(/\r\n?/g, '\n')) {
    const code = char.charCodeAt(0)
    if (code === 10 || (code >= 32 && code !== 127)) result += char
  }
  return result
}

function normalizeDraft(state: DraftState): DraftState {
  const cursor = clampCursor(state.cursor, state.text.length)
  const selectionAnchor = state.selectionAnchor === undefined
    ? undefined
    : clampCursor(state.selectionAnchor, state.text.length)
  return {
    text: state.text,
    cursor,
    ...(selectionAnchor === undefined || selectionAnchor === cursor ? {} : { selectionAnchor }),
  }
}

function clampCursor(cursor: number, length: number): number {
  if (!Number.isFinite(cursor)) return length
  return Math.max(0, Math.min(Math.trunc(cursor), length))
}
