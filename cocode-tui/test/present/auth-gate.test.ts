import { describe, expect, it } from 'vitest'
import { cycleGateOption, GATE_OPTIONS } from '../../src/present/auth-options.ts'

describe('cycleGateOption', () => {
  it('has two fork options', () => {
    expect(GATE_OPTIONS).toEqual(['byok', 'cocode'])
  })

  it('moves down and wraps', () => {
    expect(cycleGateOption(0, 1)).toBe(1)
    expect(cycleGateOption(1, 1)).toBe(0)
  })

  it('moves up and wraps', () => {
    expect(cycleGateOption(0, -1)).toBe(1)
    expect(cycleGateOption(1, -1)).toBe(0)
  })
})
