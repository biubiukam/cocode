import { describe, expect, it } from 'vitest'
import { getTheme, resolveStartupTheme, themes } from '../../../src/present/theme.ts'

describe('theme tokens', () => {
  it('keeps matching token keys for dark and light themes', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort())
    expect(getTheme('dark')).toBe(themes.dark)
  })

  it('uses explicit theme configuration before terminal hints', () => {
    expect(resolveStartupTheme({ COCODE_TUI_THEME: 'dark', TERM_PROGRAM: 'Apple_Terminal' })).toBe('dark')
    expect(resolveStartupTheme({ COCODE_TUI_THEME: 'light', COLORFGBG: '15;0' })).toBe('light')
  })

  it('follows COLORFGBG and Apple Terminal defaults for readable text', () => {
    expect(resolveStartupTheme({ COLORFGBG: '15;15' })).toBe('light')
    expect(resolveStartupTheme({ COLORFGBG: '15;0' })).toBe('dark')
    expect(resolveStartupTheme({ TERM_PROGRAM: 'Apple_Terminal' })).toBe('light')
    expect(resolveStartupTheme({ TERM_PROGRAM: 'xterm-256color' })).toBe('dark')
  })
})
