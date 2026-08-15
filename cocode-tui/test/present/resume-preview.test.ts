import { describe, expect, it } from 'vitest'
import { resumeItemPreview } from '../../src/present/resume-preview.ts'

describe('resume item preview', () => {
  it('uses the localized empty label and sanitizes a fallback path', () => {
    expect(resumeItemPreview({}, 'en')).toBe('No summary')
    expect(resumeItemPreview({ preview: '/work/\u001b[31mproject' }, 'zh')).toBe('/work/project')
  })

  it('keeps the picker row bounded to 72 visible characters', () => {
    expect(resumeItemPreview({ preview: '字'.repeat(80) }, 'zh')).toBe(`${'字'.repeat(71)}…`)
  })
})
