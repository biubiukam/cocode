import {
  closeRewindPicker,
  confirmRewindSelection,
  moveRewindSelection,
  selectedRewindItem,
  type RewindPickerItem,
  type RewindPickerState,
} from './rewind-picker.ts'

export type BoundaryPickerAction =
  | { type: 'move'; delta: number }
  | { type: 'close' }
  | { type: 'confirm' }

export type BoundaryPickerTransition = {
  state: RewindPickerState
  selected?: RewindPickerItem
}

/** Apply shared fork/rewind picker actions and return an optional selection. */
export function routeBoundaryPickerAction(
  state: RewindPickerState,
  action: BoundaryPickerAction,
): BoundaryPickerTransition {
  if (action.type === 'move') return { state: moveRewindSelection(state, action.delta) }
  if (action.type === 'close') return { state: closeRewindPicker(state) }
  if (!state.confirming) return { state: confirmRewindSelection(state) }
  return { state: closeRewindPicker(state), selected: selectedRewindItem(state) }
}
