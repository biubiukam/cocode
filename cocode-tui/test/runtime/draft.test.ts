import { describe, expect, it } from 'vitest'
import {
  backspaceDraft,
  createDraft,
  filterPrintableInput,
  insertDraft,
  insertNewline,
  moveDraftCursor,
} from '../../src/runtime/draft.ts'

describe('draft editing', () => {
  it('inserts and deletes at the cursor', () => {
    let draft = createDraft('abcd', 2)
    draft = insertDraft(draft, 'XY')
    expect(draft).toEqual({ text: 'abXYcd', cursor: 4 })
    draft = backspaceDraft(draft)
    expect(draft).toEqual({ text: 'abXcd', cursor: 3 })
  })

  it('moves within UTF-16 code-unit bounds', () => {
    let draft = createDraft('hello', 2)
    draft = moveDraftCursor(draft, -20)
    expect(draft.cursor).toBe(0)
    draft = moveDraftCursor(draft, 20)
    expect(draft.cursor).toBe(5)
  })

  it('keeps newlines and removes ASCII controls', () => {
    expect(filterPrintableInput('a\tb\u0000\r\nc\u007f')).toBe('ab\nc')
    expect(insertNewline(createDraft('ab', 1))).toEqual({
      text: 'a\nb',
      cursor: 2,
    })
  })
})
