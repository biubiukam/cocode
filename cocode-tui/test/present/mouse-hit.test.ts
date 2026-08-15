import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import {
  actionMenuItemIndexAtRow,
  listItemIndexAtRow,
  messageKeyAtRow,
} from '../../src/present/mouse-hit.ts'

const nodes: ConversationNode[] = [
  { kind: 'user', id: 'u1', seq: 1, time: 1, text: 'hello' },
  { kind: 'tool', id: 't1', seq: 2, time: 2, callId: 'c1', name: 'read', args: '', status: 'running' },
]

describe('mouse hit zones', () => {
  it('maps terminal rows to the visible conversation node', () => {
    expect(messageKeyAtRow({
      nodes,
      maxRows: 8,
      verbose: false,
      expandedNodeIds: new Set(),
      scrollOffset: 0,
      row: 5,
      startRow: 4,
    })).toBe('user:u1')
    expect(messageKeyAtRow({
      nodes,
      maxRows: 8,
      verbose: false,
      expandedNodeIds: new Set(),
      scrollOffset: 0,
      row: 7,
      startRow: 4,
    })).toBe('tool:t1')
  })

  it('maps clicks to the currently visible menu window', () => {
    expect(actionMenuItemIndexAtRow({
      row: 14,
      menuStartRow: 10,
      itemCount: 4,
      selectedIndex: 0,
      maxRows: 8,
    })).toBe(1)
    expect(actionMenuItemIndexAtRow({
      row: 20,
      menuStartRow: 10,
      itemCount: 4,
      selectedIndex: 0,
      maxRows: 8,
    })).toBeUndefined()
  })

  it('accounts for a scrolled list window and its indicator row', () => {
    expect(listItemIndexAtRow({
      row: 18,
      itemStartRow: 16,
      itemCount: 12,
      selectedIndex: 6,
      windowSize: 4,
    })).toBe(6)
    expect(listItemIndexAtRow({
      row: 15,
      itemStartRow: 16,
      itemCount: 12,
      selectedIndex: 6,
      windowSize: 4,
    })).toBeUndefined()
  })
})
