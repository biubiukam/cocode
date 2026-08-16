import { describe, expect, it } from 'vitest'
import {
  backspaceDraft,
  createDraft,
  deleteDraftSelection,
  filterPrintableInput,
  insertDraft,
  insertNewline,
  moveDraftCursor,
  selectAllDraft,
  selectedDraftRange,
  selectedDraftText,
} from '../../src/runtime/draft.ts'

describe('draft editing', () => {
  it('inserts and deletes at the cursor', () => {
    let draft = createDraft('abcd', 2)
    draft = insertDraft(draft, 'XY')
    expect(draft).toEqual({ text: 'abXYcd', cursor: 4 })
    draft = backspaceDraft(draft)
    expect(draft).toEqual({ text: 'abXcd', cursor: 3 })
  })

  it('moves by grapheme boundaries', () => {
    let draft = createDraft('hello', 2)
    draft = moveDraftCursor(draft, -20)
    expect(draft.cursor).toBe(0)
    draft = moveDraftCursor(draft, 20)
    expect(draft.cursor).toBe(5)

    draft = createDraft('a🙂b', 3)
    expect(moveDraftCursor(draft, -1).cursor).toBe(1)
    expect(backspaceDraft(createDraft('a🙂b', 3))).toEqual({ text: 'ab', cursor: 1 })
    expect(createDraft('🙂', 1).cursor).toBe(2)

    const extendedHan = 'a𠀀b'
    expect(backspaceDraft(createDraft(extendedHan, 3))).toEqual({ text: 'ab', cursor: 1 })
  })

  it('keeps combining characters as one cursor unit', () => {
    const text = 'e\u0301x'
    expect(moveDraftCursor(createDraft(text, text.length), -1).cursor).toBe(2)
    expect(backspaceDraft(createDraft(text, 2))).toEqual({ text: 'x', cursor: 0 })

    const family = '👨‍👩‍👧‍👦'
    expect(backspaceDraft(createDraft(`${family}x`, family.length))).toEqual({
      text: 'x',
      cursor: 0,
    })
  })

  it('keeps newlines and removes ASCII controls', () => {
    expect(filterPrintableInput('a\tb\u0000\r\nc\u007f')).toBe('ab\nc')
    expect(insertNewline(createDraft('ab', 1))).toEqual({
      text: 'a\nb',
      cursor: 2,
    })
  })

  it('selects all and replaces or deletes the selected text', () => {
    const selected = selectAllDraft(createDraft('hello', 2))
    expect(selectedDraftRange(selected)).toEqual({ start: 0, end: 5 })
    expect(selectedDraftText(selected)).toBe('hello')
    expect(insertDraft(selected, 'hi')).toEqual({ text: 'hi', cursor: 2 })
    expect(deleteDraftSelection(selected)).toEqual({ text: '', cursor: 0 })
    expect(backspaceDraft(selected)).toEqual({ text: '', cursor: 0 })
  })

  it('extends and collapses keyboard selections', () => {
    let draft = createDraft('hello', 2)
    draft = moveDraftCursor(draft, 2, true)
    expect(selectedDraftRange(draft)).toEqual({ start: 2, end: 4 })
    draft = moveDraftCursor(draft, -1, true)
    expect(selectedDraftRange(draft)).toEqual({ start: 2, end: 3 })
    expect(moveDraftCursor(draft, -1)).toEqual({ text: 'hello', cursor: 2 })
  })

  it('keeps selections on grapheme boundaries', () => {
    let draft = createDraft('a🙂b', 3)
    draft = moveDraftCursor(draft, -1, true)
    expect(selectedDraftRange(draft)).toEqual({ start: 1, end: 3 })
    expect(selectedDraftText(draft)).toBe('🙂')
    expect(deleteDraftSelection(draft)).toEqual({ text: 'ab', cursor: 1 })
  })
})
