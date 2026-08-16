/** Pure state transitions for the interactive permission preset picker. */

export type PermissionPickerState = {
  modes: readonly string[]
  current: string
  selected: number
  open: boolean
  pending?: string
}

export const PERMISSION_PICKER_WINDOW_SIZE = 8

export function createPermissionPicker(
  modes: readonly string[],
  current: string,
): PermissionPickerState {
  const normalizedModes = [...new Set(modes.filter((mode) => mode.trim() !== ''))]
  const selected = Math.max(0, normalizedModes.indexOf(current))
  return {
    modes: normalizedModes,
    current,
    selected,
    open: true,
  }
}

export function movePermissionSelection(
  state: PermissionPickerState,
  delta: number,
): PermissionPickerState {
  if (state.modes.length === 0) return { ...state, selected: 0 }
  return {
    ...state,
    selected: (((state.selected + delta) % state.modes.length) + state.modes.length) % state.modes.length,
  }
}

export function selectedPermissionMode(state: PermissionPickerState): string | undefined {
  return state.modes[state.selected]
}

export function closePermissionPicker(state: PermissionPickerState): PermissionPickerState {
  return { ...state, open: false, pending: undefined }
}

export function beginPermissionChange(
  state: PermissionPickerState,
  mode: string,
): PermissionPickerState {
  return { ...state, pending: mode }
}

export function completePermissionChange(
  state: PermissionPickerState,
  mode: string,
): PermissionPickerState {
  return {
    ...state,
    current: mode,
    selected: Math.max(0, state.modes.indexOf(mode)),
    pending: undefined,
  }
}

export function failPermissionChange(state: PermissionPickerState): PermissionPickerState {
  return { ...state, pending: undefined }
}
