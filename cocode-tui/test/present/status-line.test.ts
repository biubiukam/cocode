import { describe, expect, it } from 'vitest'
import { noticeLines } from '../../src/present/components/StatusLine.tsx'

describe('noticeLines', () => {
  it('keeps multiline runtime diagnostics visible', () => {
    expect(noticeLines('outer error\nplugin failed\noriginal cause')).toEqual([
      'outer error',
      'plugin failed',
      'original cause',
    ])
  })

  it('bounds unusually long diagnostics without hiding their beginning', () => {
    expect(noticeLines('a\nb\nc\nd', 3)).toEqual(['a', 'b', '… (2 more lines)'])
  })

  it('falls back to the default limit for invalid line counts', () => {
    expect(noticeLines('a\nb', Number.NaN)).toEqual(['a', 'b'])
  })
})
