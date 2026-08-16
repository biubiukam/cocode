import { describe, expect, it } from 'vitest'
import { noticeLines, noticeRows } from '../../src/present/components/StatusLine.tsx'

describe('noticeLines', () => {
  it('keeps multiline runtime diagnostics visible', () => {
    expect(noticeLines('outer error\nplugin failed\noriginal cause')).toEqual([
      'outer error',
      'plugin failed',
      'original cause',
    ])
  })

  it('does not omit unusually long diagnostics', () => {
    expect(noticeLines('a\nb\nc\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reserves wrapped rows for every diagnostic line', () => {
    expect(noticeRows('first line\nsecond diagnostic line', 10)).toBe(5)
  })
})
