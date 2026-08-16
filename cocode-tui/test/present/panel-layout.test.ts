import { describe, expect, it } from 'vitest'
import { compactColumns, panelCapacity } from '../../src/present/panel-layout.ts'

describe('panel layout', () => {
  it('keeps panel rows within the available viewport', () => {
    expect(panelCapacity(8, 4, 20)).toBe(4)
    expect(panelCapacity(undefined, 4, 3)).toBe(3)
  })

  it('classifies terminal widths consistently', () => {
    expect(compactColumns(50)).toBe('tiny')
    expect(compactColumns(100)).toBe('compact')
    expect(compactColumns(120)).toBe('wide')
  })
})
