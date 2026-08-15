import { describe, expect, it } from 'vitest'
import { matchKey } from '../../src/runtime/keymap.ts'
import { resolveKeymap } from '../../src/runtime/keymap-config.ts'

describe('keymap', () => {
  it('opens the external editor with Ctrl+G', () => {
    expect(matchKey({ raw: 'g', ctrl: true, empty: false })).toEqual({ id: 'editor.open' })
  })

  it('keeps Ctrl+G available for an empty draft', () => {
    expect(matchKey({ raw: 'g', ctrl: true, empty: true })).toEqual({ id: 'editor.open' })
  })

  it('keeps Ctrl+L model switching and a slash redraw fallback', () => {
    expect(matchKey({ raw: '?', shift: true, empty: true })).toEqual({ id: 'help.toggle' })
    expect(matchKey({ raw: 'l', ctrl: true, empty: false })).toEqual({ id: 'model.open' })
    const keymap = resolveKeymap({ COCODE_TUI_KEYMAP: '{"model.open":"alt+l"}' })
    expect(matchKey({ raw: 'l', ctrl: true, empty: false }, keymap)).toBeUndefined()
    expect(matchKey({ raw: 'l', alt: true, empty: false }, keymap)).toEqual({ id: 'model.open' })
  })

  it('allows known commands to override their default bindings', () => {
    const keymap = resolveKeymap(
      { COCODE_TUI_KEYMAP: '{"historySearch":"ctrl+f","editor.open":"alt+e"}' },
      () => undefined,
    )
    expect(matchKey({ raw: 'f', ctrl: true, empty: false }, keymap)).toEqual({
      id: 'history.search',
    })
    expect(matchKey({ raw: 'e', alt: true, empty: false }, keymap)).toEqual({ id: 'editor.open' })
    expect(matchKey({ raw: 'r', ctrl: true, empty: false }, keymap)).toBeUndefined()
  })

  it('keeps defaults and reports malformed or unknown values', () => {
    const diagnostics: string[] = []
    const keymap = resolveKeymap(
      {
        COCODE_TUI_KEYMAP: '{"unknown":"ctrl+x","editorOpen":"not-a-key","historyPrev":4}',
      },
      (message) => diagnostics.push(message),
    )
    expect(matchKey({ raw: 'g', ctrl: true, empty: false }, keymap)).toEqual({ id: 'editor.open' })
    expect(matchKey({ raw: 'up', upArrow: true, empty: false }, keymap)).toEqual({
      id: 'history.prev',
    })
    expect(diagnostics).toHaveLength(3)
    expect(diagnostics.join('\n')).toContain('unknown keymap command')
    expect(diagnostics.join('\n')).toContain('invalid key')
  })

  it('falls back to all defaults when JSON is invalid', () => {
    const diagnostics: string[] = []
    const keymap = resolveKeymap({ COCODE_TUI_KEYMAP: '{not-json' }, (message) =>
      diagnostics.push(message),
    )
    expect(matchKey({ raw: 'r', ctrl: true, empty: false }, keymap)).toEqual({
      id: 'history.search',
    })
    expect(diagnostics).toEqual([
      'Cocode TUI: invalid COCODE_TUI_KEYMAP JSON; using default keymap.',
    ])
  })
})
