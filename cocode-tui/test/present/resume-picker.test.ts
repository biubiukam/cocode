import { describe, expect, it } from 'vitest'
import { windowStart } from '../../src/present/components/ResumePicker.tsx'

describe('resume picker window', () => {
  it('keeps the selected session inside a bounded window', () => {
    expect(windowStart(0, 20, 8)).toBe(0)
    expect(windowStart(10, 20, 8)).toBe(6)
    expect(windowStart(19, 20, 8)).toBe(12)
  })
})
