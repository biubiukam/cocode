import { describe, expect, it } from 'vitest'
import { formatReasoning, formatToolResult, truncateText } from '../../src/present/text-format.ts'

describe('presentation text formatting', () => {
  it('summarizes reasoning until verbose mode is enabled', () => {
    expect(formatReasoning('thinking', false, true)).toBe('thinking · 8 chars …')
    expect(formatReasoning('thinking', true, false)).toBe('thinking')
    expect(formatReasoning('', false, false)).toBeUndefined()
  })

  it('keeps non-verbose tool previews to one line', () => {
    expect(formatToolResult('first\nsecond', false)).toBe('first')
    expect(formatToolResult('1234567890', false)).toBe('1234567890')
  })

  it('limits verbose results and reports hidden lines', () => {
    const result = formatToolResult(
      Array.from({ length: 42 }, (_, index) => `line-${index}`).join('\n'),
      true,
    )
    expect(result?.split('\n')).toHaveLength(41)
    expect(result?.split('\n').at(-1)).toBe('… +2 lines')
  })

  it('truncates without exceeding the requested length', () => {
    expect(truncateText('abcdef', 4)).toBe('abc…')
    expect(truncateText('abcdef', 0)).toBe('')
  })
})
