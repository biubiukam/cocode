import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import {
  clipComposerRow,
  renderComposerRows,
  visibleComposerRows,
} from '../../src/present/composer-layout.ts'

describe('composer row projection', () => {
  it('renders exactly one cursor across multiple lines', () => {
    const rows = renderComposerRows('one\ntwo\nthree', 5)
    expect(rows.filter((row) => row.cursor !== undefined)).toHaveLength(1)
    expect(rows[1]).toEqual({ before: 't', cursor: 'w', after: 'o' })
  })

  it('keeps the cursor row visible inside a bounded window', () => {
    const rows = renderComposerRows('one\ntwo\nthree\nfour', 14)
    expect(visibleComposerRows(rows, 2)).toEqual(rows.slice(2, 4))
  })

  it('keeps the cursor visible in a long single line', () => {
    const row = renderComposerRows('abcdefghijklmnopqrstuvwxyz', 25)[0]!
    const clipped = clipComposerRow(row, 10)
    expect(clipped.cursor).toBe('z')
    expect(clipped.before.startsWith('…')).toBe(true)
    expect(stringWidth(clipped.before + clipped.cursor! + clipped.after)).toBeLessThanOrEqual(10)
  })

  it('uses terminal cell width for CJK text', () => {
    const row = renderComposerRows('甲乙丙丁戊己庚辛', 4)[0]!
    const clipped = clipComposerRow(row, 8)
    expect(clipped.cursor).toBe('戊')
    expect(stringWidth(clipped.before + clipped.cursor! + clipped.after)).toBeLessThanOrEqual(8)
  })
})
