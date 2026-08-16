import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import {
  clipComposerRow,
  composerRowText,
  renderComposerRows,
  visibleComposerRows,
} from '../../src/present/composer-layout.ts'

describe('composer row projection', () => {
  it('renders exactly one cursor across multiple lines', () => {
    const rows = renderComposerRows('one\ntwo\nthree', 5)
    expect(rows.filter((row) => row.spans.some((span) => span.cursor))).toHaveLength(1)
    expect(rows[1]).toEqual({
      spans: [
        { text: 't' },
        { text: 'w', cursor: true },
        { text: 'o' },
      ],
    })
  })

  it('keeps the cursor row visible inside a bounded window', () => {
    const rows = renderComposerRows('one\ntwo\nthree\nfour', 14)
    expect(visibleComposerRows(rows, 2)).toEqual(rows.slice(2, 4))
  })

  it('keeps the cursor visible in a long single line', () => {
    const row = renderComposerRows('abcdefghijklmnopqrstuvwxyz', 25)[0]!
    const clipped = clipComposerRow(row, 10)
    expect(clipped.spans.find((span) => span.cursor)?.text).toBe('z')
    expect(composerRowText(clipped).startsWith('…')).toBe(true)
    expect(stringWidth(composerRowText(clipped))).toBeLessThanOrEqual(10)
  })

  it('uses terminal cell width for CJK text', () => {
    const row = renderComposerRows('甲乙丙丁戊己庚辛', 4)[0]!
    const clipped = clipComposerRow(row, 8)
    expect(clipped.spans.find((span) => span.cursor)?.text).toBe('戊')
    expect(stringWidth(composerRowText(clipped))).toBeLessThanOrEqual(8)
  })

  it('marks selected spans across multiple rows', () => {
    const rows = renderComposerRows('one\ntwo', 7, { start: 1, end: 7 })
    expect(rows[0]?.spans).toEqual([
      { text: 'o' },
      { text: 'ne', selected: true },
    ])
    expect(rows[1]?.spans).toEqual([
      { text: 'two', selected: true },
      { text: ' ', cursor: true },
    ])
  })
})
