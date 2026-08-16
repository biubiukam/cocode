import { describe, expect, it } from 'vitest'
import {
  checklistCounts,
  clampChecklistSelection,
  closeChecklist,
  createChecklist,
  moveChecklistSelection,
} from '../../src/runtime/checklist.ts'
import type { SessionTodo } from '../../src/runtime/session-state.ts'

const todos: readonly SessionTodo[] = [
  { content: 'Inspect the runtime', status: 'completed' },
  { content: 'Build the checklist', status: 'in_progress' },
  { content: 'Review the interaction', status: 'pending' },
]

describe('checklist state', () => {
  it('opens on the active task and reports progress', () => {
    expect(createChecklist(todos)).toEqual({ open: true, selected: 1 })
    expect(checklistCounts(todos)).toEqual({ completed: 1, total: 3 })
  })

  it('falls back to the first pending task and then the first item', () => {
    expect(createChecklist([
      { content: 'done', status: 'completed' },
      { content: 'next', status: 'pending' },
    ])).toEqual({ open: true, selected: 1 })
    expect(createChecklist([
      { content: 'done', status: 'completed' },
    ])).toEqual({ open: true, selected: 0 })
    expect(createChecklist([])).toEqual({ open: true, selected: 0 })
  })

  it('wraps navigation and clamps when the list shrinks', () => {
    const state = createChecklist(todos)
    expect(moveChecklistSelection(state, 1, todos.length).selected).toBe(2)
    expect(moveChecklistSelection(state, 2, todos.length).selected).toBe(0)
    expect(clampChecklistSelection({ open: true, selected: 4 }, 2)).toEqual({
      open: true,
      selected: 1,
    })
  })

  it('closes without discarding the selected row', () => {
    expect(closeChecklist({ open: true, selected: 2 })).toEqual({ open: false, selected: 2 })
  })
})
