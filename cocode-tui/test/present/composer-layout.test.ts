import { describe, expect, it } from 'vitest'
import stringWidth from 'string-width'
import {
  clipComposerRow,
  composerImeCaret,
  composerInputRows,
  composerRenderedRows,
  composerRowText,
  composerCursorStyle,
  renderComposerRows,
  visibleComposerRows,
} from '../../src/present/composer-layout.ts'

describe('composer row projection', () => {
  it('budgets one metadata row plus independent attachment and image summaries', () => {
    expect(composerInputRows('', 6)).toBe(1)
    expect(
      composerInputRows('one\ntwo\nthree\nfour\nfive\nsix\nseven', 6),
    ).toBe(6)
    expect(composerRenderedRows({ text: '', maxRows: 6 })).toBe(2)
    expect(
      composerRenderedRows({ text: 'draft', maxRows: 6, hasAttachments: true }),
    ).toBe(3)
    expect(
      composerRenderedRows({ text: 'draft', maxRows: 6, hasImages: true }),
    ).toBe(3)
    expect(
      composerRenderedRows({
        text: 'draft',
        maxRows: 6,
        hasAttachments: true,
        hasImages: true,
      }),
    ).toBe(4)
  })

  it('does not split graphemes when rendering or clipping', () => {
    const rows = renderComposerRows('a🙂b', 1)
    expect(rows[0]?.spans).toEqual([
      { text: 'a' },
      { text: '🙂', cursor: true },
      { text: 'b' },
    ])
    expect(clipComposerRow(rows[0]!, 3).spans).toEqual([
      { text: 'a' },
      { text: '🙂', cursor: true },
    ])
  })

  it('uses an underline cursor in Apple Terminal', () => {
    expect(composerCursorStyle(false, false)).toEqual({
      inverse: true,
      underline: false,
    })
    expect(composerCursorStyle(true, false)).toEqual({
      inverse: false,
      underline: true,
    })
    expect(composerCursorStyle(true, true)).toEqual({
      inverse: false,
      underline: false,
    })
  })

  it('renders exactly one cursor across multiple lines', () => {
    const rows = renderComposerRows('one\ntwo\nthree', 5)
    expect(
      rows.filter((row) => row.spans.some((span) => span.cursor)),
    ).toHaveLength(1)
    expect(rows[1]).toEqual({
      spans: [{ text: 't' }, { text: 'w', cursor: true }, { text: 'o' }],
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

  it.each([40, 60, 80, 120])(
    'clips representative graphemes within %i columns after the 2-cell marker',
    (columns) => {
      for (const value of [
        'ascii '.repeat(columns),
        '中文消息会按照终端单元格宽度裁切',
        'emoji 👩🏽‍💻 and cafe\u0301',
      ]) {
        const row = renderComposerRows(value, value.length)[0]!
        const clipped = clipComposerRow(row, columns - 2)
        expect(stringWidth(composerRowText(clipped))).toBeLessThanOrEqual(
          columns - 2,
        )
      }
    },
  )

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

  it('expands malformed selection offsets to whole graphemes', () => {
    expect(
      renderComposerRows('a🙂b', 4, { start: 2, end: 3 })[0]?.spans,
    ).toEqual([
      { text: 'a' },
      { text: '🙂', selected: true },
      { text: 'b' },
      { text: ' ', cursor: true },
    ])
  })

  it('places the IME caret after the prompt marker on the draft row', () => {
    const text = '帮我 asd'
    expect(
      composerImeCaret({
        text,
        cursor: text.length,
        maxInputRows: 6,
        maxColumns: 80,
      }),
    ).toEqual({
      rowIndex: 0,
      column: 2 + stringWidth(text),
    })
  })

  it('follows the visible cursor row in a multiline draft', () => {
    const text = 'one\ntwo'
    expect(
      composerImeCaret({
        text,
        cursor: text.length,
        maxInputRows: 6,
        maxColumns: 80,
      }),
    ).toEqual({
      rowIndex: 1,
      column: 2 + stringWidth('two'),
    })
  })

  it('does not paint a trailing caret cell when the hardware cursor is used', () => {
    expect(
      renderComposerRows('你好终于', 4, undefined, { caretCell: false }),
    ).toEqual([{ spans: [{ text: '你好终于' }], caretAtEnd: true }])
  })

  it('clips a hardware-caret line toward the end being edited', () => {
    const row = renderComposerRows(
      'abcdefghijklmnopqrstuvwxyz',
      26,
      undefined,
      {
        caretCell: false,
      },
    )[0]!
    const clipped = clipComposerRow(row, 10)

    expect(row.caretAtEnd).toBe(true)
    expect(composerRowText(clipped).startsWith('…')).toBe(true)
    expect(composerRowText(clipped).endsWith('z')).toBe(true)
    expect(stringWidth(composerRowText(clipped))).toBeLessThanOrEqual(10)
  })

  it('keeps the hardware IME caret on the draft row when the line is clipped', () => {
    const text = 'x'.repeat(80)
    const caret = composerImeCaret({
      text,
      cursor: text.length,
      maxInputRows: 6,
      maxColumns: 40,
    })

    expect(caret.rowIndex).toBe(0)
    expect(caret.column).toBeGreaterThanOrEqual(2)
    expect(caret.column).toBeLessThan(40)
  })
})
