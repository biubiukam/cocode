/** Pure state transitions for the double-Esc rewind picker. */

export type RewindPickerItem = {
  id: string
  seq: number
  text: string
}

export type RewindPickerState = {
  items: readonly RewindPickerItem[]
  selected: number
  confirming: boolean
  open: boolean
}

export const REWIND_WINDOW_SIZE = 6

export function createRewindPicker(items: readonly RewindPickerItem[]): RewindPickerState {
  return { items: [...items], selected: 0, confirming: false, open: true }
}

export function moveRewindSelection(state: RewindPickerState, delta: number): RewindPickerState {
  if (state.confirming || state.items.length === 0) return state
  const selected =
    (((state.selected + delta) % state.items.length) + state.items.length) % state.items.length
  return { ...state, selected }
}

export function selectedRewindItem(state: RewindPickerState): RewindPickerItem | undefined {
  return state.items[state.selected]
}

export function confirmRewindSelection(state: RewindPickerState): RewindPickerState {
  return state.confirming ? state : { ...state, confirming: true }
}

export function closeRewindPicker(state: RewindPickerState): RewindPickerState {
  if (state.confirming) return { ...state, confirming: false }
  return { ...state, open: false }
}
