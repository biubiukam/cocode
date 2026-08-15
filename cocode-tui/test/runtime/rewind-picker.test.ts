import { describe, expect, it } from 'vitest'
import {
  closeRewindPicker,
  confirmRewindSelection,
  createRewindPicker,
  moveRewindSelection,
  selectedRewindItem,
} from '../../src/runtime/rewind-picker.ts'

const items = [
  { id: 'a', seq: 1, text: 'first' },
  { id: 'b', seq: 3, text: 'second' },
]

describe('rewind picker', () => {
  it('wraps selection and confirms before executing', () => {
    const state = createRewindPicker(items)
    expect(moveRewindSelection(state, -1).selected).toBe(1)
    const confirming = confirmRewindSelection(moveRewindSelection(state, 1))
    expect(confirming.confirming).toBe(true)
    expect(selectedRewindItem(confirming)?.id).toBe('b')
    expect(moveRewindSelection(confirming, 1)).toEqual(confirming)
  })

  it('closes confirmation first, then the picker', () => {
    const confirming = confirmRewindSelection(createRewindPicker(items))
    const reopened = closeRewindPicker(confirming)
    expect(reopened.open).toBe(true)
    expect(reopened.confirming).toBe(false)
    expect(closeRewindPicker(reopened).open).toBe(false)
  })
})
