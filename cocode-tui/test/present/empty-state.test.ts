import { describe, expect, it } from 'vitest'
import { text } from '../../src/runtime/ui-locale.ts'

describe('empty state copy', () => {
  it('has localized title and hint', () => {
    expect(text('en', 'emptyTitle')).toBe('cocode is ready')
    expect(text('zh', 'emptyTitle')).toBe('cocode 已准备好')
    expect(text('zh', 'emptyHint')).toContain('开始工作')
  })
})
