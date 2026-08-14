import { describe, expect, it } from 'vitest'
import { getTheme, themes } from '../../../src/present/theme.ts'

describe('theme tokens', () => {
  it('keeps matching token keys for dark and light themes', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort())
    expect(getTheme('dark')).toBe(themes.dark)
  })
})
