import { describe, expect, it } from 'vitest'
import {
  beginPermissionChange,
  closePermissionPicker,
  completePermissionChange,
  createPermissionPicker,
  failPermissionChange,
  movePermissionSelection,
  selectedPermissionMode,
} from '../../src/runtime/permission-picker.ts'

describe('permission picker state', () => {
  it('deduplicates presets and selects the current mode', () => {
    const state = createPermissionPicker(['manual', 'allow-all', 'manual'], 'allow-all')

    expect(state).toMatchObject({
      modes: ['manual', 'allow-all'],
      current: 'allow-all',
      selected: 1,
      open: true,
    })
    expect(selectedPermissionMode(state)).toBe('allow-all')
  })

  it('wraps selection in both directions', () => {
    const state = createPermissionPicker(['manual', 'workspace-write', 'allow-all'], 'manual')

    expect(movePermissionSelection(state, -1).selected).toBe(2)
    expect(movePermissionSelection(state, 4).selected).toBe(1)
  })

  it('tracks pending, completion, failure, and close states', () => {
    const state = createPermissionPicker(['manual', 'allow-all'], 'manual')
    const pending = beginPermissionChange(state, 'allow-all')
    expect(pending.pending).toBe('allow-all')
    expect(failPermissionChange(pending).pending).toBeUndefined()
    expect(completePermissionChange(pending, 'allow-all')).toMatchObject({
      current: 'allow-all',
      selected: 1,
      pending: undefined,
    })
    expect(closePermissionPicker(pending)).toMatchObject({ open: false, pending: undefined })
  })
})
