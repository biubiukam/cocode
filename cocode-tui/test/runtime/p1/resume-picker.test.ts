import { describe, expect, it } from 'vitest'
import {
  createResumePicker,
  moveResumeSelection,
  selectedResumeItem,
  setResumeQuery,
  visibleResumeItems,
} from '../../../src/runtime/resume-picker.ts'

describe('resume picker', () => {
  it('filters and wraps selection', () => {
    const picker = createResumePicker([
      { id: 'one', label: 'First' },
      { id: 'two', label: 'Second' },
    ])
    const filtered = setResumeQuery(picker, 'second')
    expect(visibleResumeItems(filtered)).toEqual([{ id: 'two', label: 'Second' }])
    expect(selectedResumeItem(moveResumeSelection(filtered, 1))?.id).toBe('two')
    expect(selectedResumeItem(moveResumeSelection(filtered, -1))?.id).toBe('two')
  })

  it('keeps an empty picker selectable without throwing', () => {
    const picker = createResumePicker([])
    expect(moveResumeSelection(picker, 1).selected).toBe(0)
    expect(selectedResumeItem(picker)).toBeUndefined()
  })
})
