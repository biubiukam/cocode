import { describe, expect, it } from 'vitest'
import {
  closePromptQueuePicker,
  createPromptQueuePicker,
  movePromptQueueSelection,
  removeSelectedPrompt,
  restoreSelectedPrompt,
  selectedPromptQueueItem,
  setPromptQueueQuery,
  visiblePromptQueueItems,
  type PromptQueuePickerItem,
} from '../../src/runtime/prompt-queue-picker.ts'

const items: PromptQueuePickerItem[] = [
  { id: 'one', text: 'Fix the parser', attachments: [] },
  { id: 'two', text: 'Add tests', attachments: [] },
  { id: 'three', text: 'Update docs', attachments: [] },
]

describe('prompt queue picker', () => {
  it('filters items and wraps selection over the visible list', () => {
    const filtered = setPromptQueueQuery(createPromptQueuePicker(items), 'tests')
    expect(visiblePromptQueueItems(filtered).map((item) => item.id)).toEqual(['two'])
    expect(selectedPromptQueueItem(filtered)?.id).toBe('two')

    const all = createPromptQueuePicker(items)
    expect(movePromptQueueSelection(all, -1).selected).toBe(2)
  })

  it('removes the selected item and restores another item to the front', () => {
    const selected = movePromptQueueSelection(createPromptQueuePicker(items), 1)
    const restored = restoreSelectedPrompt(selected)
    expect(restored.items.map((item) => item.id)).toEqual(['two', 'one', 'three'])
    expect(restored.selected).toBe(0)

    const removed = removeSelectedPrompt(restored)
    expect(removed.items.map((item) => item.id)).toEqual(['one', 'three'])
    expect(removed.selected).toBe(0)
  })

  it('closes without changing queue contents', () => {
    const state = closePromptQueuePicker(createPromptQueuePicker(items))
    expect(state.open).toBe(false)
    expect(state.items).toEqual(items)
  })
})
