import { describe, expect, it } from 'vitest'
import { listWindowStart } from '../../src/present/list-window.ts'

describe('resume picker window', () => {
  it('keeps the selected session inside a bounded window', () => {
    expect(listWindowStart(0, 20, 8)).toBe(0)
    expect(listWindowStart(10, 20, 8)).toBe(6)
    expect(listWindowStart(19, 20, 8)).toBe(12)
  })
})
