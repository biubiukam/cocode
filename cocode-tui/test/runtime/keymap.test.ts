import { describe, expect, it } from 'vitest'
import { matchKey } from '../../src/runtime/keymap.ts'

describe('keymap', () => {
  it('opens the external editor with Ctrl+G', () => {
    expect(matchKey({ raw: 'g', ctrl: true, empty: false })).toEqual({ id: 'editor.open' })
  })

  it('keeps Ctrl+G available for an empty draft', () => {
    expect(matchKey({ raw: 'g', ctrl: true, empty: true })).toEqual({ id: 'editor.open' })
  })
})
