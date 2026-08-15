import type { QueuedPrompt } from './prompt-queue.ts'

export type PromptQueuePickerItem = QueuedPrompt

export type PromptQueuePickerState = {
  items: readonly PromptQueuePickerItem[]
  query: string
  selected: number
  open: boolean
}

export const PROMPT_QUEUE_WINDOW_SIZE = 8

export function createPromptQueuePicker(
  items: readonly PromptQueuePickerItem[],
): PromptQueuePickerState {
  return { items: [...items], query: '', selected: 0, open: true }
}

export function setPromptQueueQuery(
  state: PromptQueuePickerState,
  query: string,
): PromptQueuePickerState {
  return { ...state, query, selected: 0 }
}

export function movePromptQueueSelection(
  state: PromptQueuePickerState,
  delta: number,
): PromptQueuePickerState {
  const visible = visiblePromptQueueItems(state)
  if (visible.length === 0) return { ...state, selected: 0 }
  return {
    ...state,
    selected: (((state.selected + delta) % visible.length) + visible.length) % visible.length,
  }
}

export function selectedPromptQueueItem(
  state: PromptQueuePickerState,
): PromptQueuePickerItem | undefined {
  return visiblePromptQueueItems(state)[state.selected]
}

export function removeSelectedPrompt(state: PromptQueuePickerState): PromptQueuePickerState {
  const selected = selectedPromptQueueItem(state)
  if (selected === undefined) return state
  const items = state.items.filter((item) => item.id !== selected.id)
  return {
    ...state,
    items,
    selected: Math.max(
      0,
      Math.min(state.selected, visiblePromptQueueItems({ ...state, items }).length - 1),
    ),
  }
}

/** Move the selected prompt to the front of the queue for the next send. */
export function restoreSelectedPrompt(state: PromptQueuePickerState): PromptQueuePickerState {
  const selected = selectedPromptQueueItem(state)
  if (selected === undefined || state.items[0]?.id === selected.id) return state
  return {
    ...state,
    items: [selected, ...state.items.filter((item) => item.id !== selected.id)],
    selected: 0,
  }
}

export function closePromptQueuePicker(state: PromptQueuePickerState): PromptQueuePickerState {
  return { ...state, open: false }
}

export function visiblePromptQueueItems(state: PromptQueuePickerState): PromptQueuePickerItem[] {
  const query = state.query.trim().toLocaleLowerCase()
  if (query === '') return [...state.items]
  return state.items.filter((item) => item.text.toLocaleLowerCase().includes(query))
}

export function clampPromptQueueSelection(state: PromptQueuePickerState): PromptQueuePickerState {
  const visible = visiblePromptQueueItems(state)
  return {
    ...state,
    selected: Math.max(0, Math.min(state.selected, Math.max(0, visible.length - 1))),
  }
}
