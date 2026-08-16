import { describe, expect, it } from 'vitest'
import {
  noticeLines,
  noticeRows,
  NOTICE_MAX_ROWS,
  visibleNoticeRows,
} from '../../src/present/components/StatusLine.tsx'

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

  it('caps the status layout without removing diagnostic content', () => {
    const message = Array.from({ length: NOTICE_MAX_ROWS + 4 }, (_, index) => `line ${index}`).join('\n')
    expect(noticeRows(message, 80)).toBe(NOTICE_MAX_ROWS + 4)
    expect(visibleNoticeRows(message, 80)).toBe(NOTICE_MAX_ROWS)
    expect(noticeLines(message)).toHaveLength(NOTICE_MAX_ROWS + 4)
  })
})
