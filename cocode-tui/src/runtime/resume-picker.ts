/** Pure state transitions for the local session resume picker. */

export type ResumePickerItem = {
  id: string
  label?: string
  preview?: string
}

export type ResumePickerState = {
  items: readonly ResumePickerItem[]
  query: string
  selected: number
  open: boolean
}

export function createResumePicker(items: readonly ResumePickerItem[]): ResumePickerState {
  return { items: [...items], query: '', selected: 0, open: true }
}

export function setResumeQuery(state: ResumePickerState, query: string): ResumePickerState {
  return { ...state, query, selected: 0 }
}

export function moveResumeSelection(state: ResumePickerState, delta: number): ResumePickerState {
  const visible = visibleResumeItems(state)
  if (visible.length === 0) return { ...state, selected: 0 }
  const selected = (((state.selected + delta) % visible.length) + visible.length) % visible.length
  return { ...state, selected }
}

export function selectedResumeItem(state: ResumePickerState): ResumePickerItem | undefined {
  return visibleResumeItems(state)[state.selected]
}

export function closeResumePicker(state: ResumePickerState): ResumePickerState {
  return { ...state, open: false }
}

export function visibleResumeItems(state: ResumePickerState): ResumePickerItem[] {
  const query = state.query.trim().toLocaleLowerCase()
  if (query === '') return [...state.items]
  return state.items.filter((item) =>
    `${item.id} ${item.label ?? ''} ${item.preview ?? ''}`.toLocaleLowerCase().includes(query),
  )
}
