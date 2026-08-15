import { describe, expect, it } from 'vitest'
import { checklistStripRows } from '../../src/present/components/ChecklistStrip.tsx'

describe('checklist strip layout', () => {
  it('reserves a summary row for overflow tasks', () => {
    expect(checklistStripRows(0)).toBe(0)
    expect(checklistStripRows(3)).toBe(7)
    expect(checklistStripRows(5)).toBe(9)
    expect(checklistStripRows(5, 2)).toBe(7)
  })
})
