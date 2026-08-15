import { describe, expect, it, vi } from 'vitest'
import type { TuiApp } from '../../src/runtime/app.ts'
import { dispatchKeyCommand, moveSelection } from '../../src/present/chat-input.ts'

describe('chat input helpers', () => {
  it('wraps selection indexes and handles empty menus', () => {
    expect(moveSelection(0, -1, 3)).toBe(2)
    expect(moveSelection(2, 1, 3)).toBe(0)
    expect(moveSelection(4, 1, 0)).toBe(0)
  })

  it('dispatches stable keymap commands to TuiApp actions', () => {
    const dispatch = vi.fn()
    const app = { dispatch } as unknown as TuiApp
    dispatchKeyCommand(app, 'input.submit', 'hello')
    dispatchKeyCommand(app, 'input.newline', '')
    dispatchKeyCommand(app, 'history.next', '')
    expect(dispatch.mock.calls).toEqual([
      [{ type: 'submit', text: 'hello' }],
      [{ type: 'insertDraft', text: '\n' }],
      [{ type: 'historyNext' }],
    ])
  })
})
