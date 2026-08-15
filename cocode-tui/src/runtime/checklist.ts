import type { SessionTodo } from './session-state.ts'

export type ChecklistState = {
  open: boolean
  selected: number
}

export const CHECKLIST_WINDOW_SIZE = 8

export function createChecklist(todos: readonly SessionTodo[]): ChecklistState {
  const active = todos.findIndex((todo) => todo.status === 'in_progress')
  const pending = todos.findIndex((todo) => todo.status === 'pending')
  return {
    open: true,
    selected: active >= 0 ? active : pending >= 0 ? pending : 0,
  }
}

export function moveChecklistSelection(
  state: ChecklistState,
  delta: number,
  itemCount: number,
): ChecklistState {
  if (itemCount <= 0) return { ...state, selected: 0 }
  return {
    ...state,
    selected: (((state.selected + delta) % itemCount) + itemCount) % itemCount,
  }
}

export function clampChecklistSelection(
  state: ChecklistState,
  itemCount: number,
): ChecklistState {
  return {
    ...state,
    selected: Math.max(0, Math.min(state.selected, Math.max(0, itemCount - 1))),
  }
}

export function closeChecklist(state: ChecklistState): ChecklistState {
  return { ...state, open: false }
}

export function checklistCounts(todos: readonly SessionTodo[]): {
  completed: number
  total: number
} {
  return {
    completed: todos.filter((todo) => todo.status === 'completed').length,
    total: todos.length,
  }
}
