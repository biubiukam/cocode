import { describe, expect, it } from 'vitest'
import {
  closeSessionTreePicker,
  createSessionTreePicker,
  moveSessionTreeSelection,
  selectedSessionTreeItem,
  setSessionTreeActivity,
  setSessionTreeQuery,
  visibleSessionTreeItems,
} from '../../src/runtime/session-tree-picker.ts'
import type { SessionTreePickerItem } from '../../src/runtime/session-tree-picker.ts'

const items: SessionTreePickerItem[] = [
  {
    session: {
      id: 'root',
      createdAt: 1,
      title: 'Root task',
      path: '/tmp/root.jsonl',
    },
    depth: 0,
    orphaned: false,
    current: true,
    source: 'jsonl',
    path: '/tmp/root.jsonl',
  },
  {
    session: {
      id: 'child',
      createdAt: 2,
      title: 'Child review',
      parentSession: 'root',
      path: '',
    },
    depth: 1,
    orphaned: false,
    current: false,
    source: 'rpc',
  },
]

describe('session tree picker', () => {
  it('filters by title and wraps selection', () => {
    const state = createSessionTreePicker(items)
    expect(visibleSessionTreeItems(setSessionTreeQuery(state, 'review'))[0]?.session.id).toBe(
      'child',
    )
    expect(selectedSessionTreeItem(moveSessionTreeSelection(state, -1))?.session.id).toBe('child')
  })

  it('closes without mutating the selected item', () => {
    const state = closeSessionTreePicker(createSessionTreePicker(items))
    expect(state.open).toBe(false)
    expect(selectedSessionTreeItem(state)?.session.id).toBe('root')
  })

  it('projects live activity without changing the picker selection', () => {
    const state = createSessionTreePicker(items)
    const running = setSessionTreeActivity(state, 'child', 'running')
    expect(running.selected).toBe(state.selected)
    expect(running.items.find((item) => item.session.id === 'child')?.activity).toBe('running')
    expect(setSessionTreeActivity(running, 'missing', 'idle')).toBe(running)
  })
})
