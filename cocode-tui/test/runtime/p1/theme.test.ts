import { describe, expect, it } from 'vitest'
import {
  getTheme,
  resolveInitialTheme,
  resolveTheme,
  themes,
} from '../../../src/present/theme.ts'

describe('theme tokens', () => {
  it('keeps matching token keys for dark and light themes', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort())
    expect(getTheme('dark')).toBe(themes.dark)
  })

  it('keeps the original ANSI fallback for terminals without truecolor', () => {
    expect(resolveTheme('light', false)).toMatchObject({
      text: 'white',
      dim: 'gray',
      accent: 'cyan',
    })
  })

  it('detects a light terminal background from COLORFGBG', () => {
    expect(resolveInitialTheme({ COLORFGBG: '0;15' }, { platform: 'linux' })).toBe('light')
    expect(resolveInitialTheme({ COLORFGBG: '15;0' }, { platform: 'linux' })).toBe('dark')
  })

  it('follows the macOS system appearance before COLORFGBG', () => {
    expect(
      resolveInitialTheme(
        { COLORFGBG: '15;0' },
        { platform: 'darwin', readSystemTheme: () => 'light' },
      ),
    ).toBe('light')
    expect(
      resolveInitialTheme(
        { COLORFGBG: '0;15' },
        { platform: 'darwin', readSystemTheme: () => 'dark' },
      ),
    ).toBe('dark')
  })

  it('lets explicit theme configuration override terminal detection', () => {
    expect(resolveInitialTheme({ COCODE_TUI_THEME: 'light', COLORFGBG: '15;0' })).toBe('light')
    expect(resolveInitialTheme({ COCODE_TUI_THEME: 'dark', COLORFGBG: '0;15' })).toBe('dark')
    expect(
      resolveInitialTheme(
        { COCODE_TUI_THEME: 'system', COLORFGBG: '15;0' },
        { platform: 'darwin', readSystemTheme: () => 'light' },
      ),
    ).toBe('light')
  })
})
