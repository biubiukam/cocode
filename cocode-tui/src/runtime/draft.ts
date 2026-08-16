/** Pure draft editing with UTF-16 offsets normalized to grapheme boundaries. */

import { moveByGraphemes, normalizeGraphemeOffset } from './grapheme.ts'

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
  return { text, cursor: normalizeGraphemeOffset(text, cursor) }
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
  const cursor = normalizeGraphemeOffset(state.text, state.cursor)
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
  const safeStart = normalizeGraphemeOffset(state.text, start, 'previous')
  const safeEnd = Math.max(
    safeStart,
    normalizeGraphemeOffset(state.text, end, 'next'),
  )
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
  const cursor = normalizeGraphemeOffset(state.text, state.cursor)
  if (!extendSelection) {
    const selection = selectedDraftRange(state)
    if (selection !== undefined) {
      return createDraft(state.text, delta < 0 ? selection.start : selection.end)
    }
    return createDraft(state.text, moveByGraphemes(state.text, cursor, delta))
  }
  const selectionAnchor = normalizeGraphemeOffset(state.text, state.selectionAnchor ?? cursor)
  const nextCursor = moveByGraphemes(state.text, cursor, delta)
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
  const cursor = normalizeGraphemeOffset(state.text, state.cursor)
  if (cursor === 0) return { text: state.text, cursor }
  const previous = moveByGraphemes(state.text, cursor, -1)
  return {
    text: state.text.slice(0, previous) + state.text.slice(cursor),
    cursor: previous,
  }
}

export function selectAllDraft(state: DraftState): DraftState {
  if (state.text === '') return createDraft()
  return { text: state.text, cursor: state.text.length, selectionAnchor: 0 }
}

export function selectedDraftRange(state: DraftState): DraftSelection | undefined {
  if (state.selectionAnchor === undefined) return undefined
  const cursor = normalizeGraphemeOffset(state.text, state.cursor)
  const anchor = normalizeGraphemeOffset(state.text, state.selectionAnchor)
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
  const cursor = normalizeGraphemeOffset(state.text, state.cursor)
  const selectionAnchor = state.selectionAnchor === undefined
    ? undefined
    : normalizeGraphemeOffset(state.text, state.selectionAnchor)
  return {
    text: state.text,
    cursor,
    ...(selectionAnchor === undefined || selectionAnchor === cursor ? {} : { selectionAnchor }),
  }
}
