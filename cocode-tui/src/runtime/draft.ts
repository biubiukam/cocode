/**
 * Pure draft editing over UTF-16 code units.
 */

export type DraftState = {
  text: string
  cursor: number
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

export function moveDraftCursor(state: DraftState, delta: number): DraftState {
  return {
    text: state.text,
    cursor: clampCursor(state.cursor + Math.trunc(delta), state.text.length),
  }
}

export function backspaceDraft(state: DraftState): DraftState {
  const cursor = clampCursor(state.cursor, state.text.length)
  if (cursor === 0) return { text: state.text, cursor }
  return {
    text: state.text.slice(0, cursor - 1) + state.text.slice(cursor),
    cursor: cursor - 1,
  }
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
  return {
    text: state.text,
    cursor: clampCursor(state.cursor, state.text.length),
  }
}

function clampCursor(cursor: number, length: number): number {
  if (!Number.isFinite(cursor)) return length
  return Math.max(0, Math.min(Math.trunc(cursor), length))
}
