import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { moveMessageSelection, selectableMessageKeys } from '../../src/present/message-selection.ts'

const user: ConversationNode = {
  kind: 'user',
  id: 'u1',
  seq: 1,
  time: 1,
  text: 'hello',
}

const tool: ConversationNode = {
  kind: 'tool',
  id: 't1',
  seq: 2,
  time: 2,
  callId: 'c1',
  name: 'read',
  args: '',
  status: 'running',
}

const notice: ConversationNode = {
  kind: 'notice',
  id: 'n1',
  seq: 3,
  time: 3,
  tone: 'info',
  message: 'status',
}

describe('message selection', () => {
  it('selects conversation nodes and skips notices', () => {
    expect(selectableMessageKeys([user, tool, notice])).toEqual(['user:u1', 'tool:t1'])
  })

  it('moves within the list and clamps at both ends', () => {
    const keys = ['user:u1', 'tool:t1']
    expect(moveMessageSelection(keys, null, -1)).toBe('user:u1')
    expect(moveMessageSelection(keys, 'tool:t1', 1)).toBe('tool:t1')
    expect(moveMessageSelection(keys, 'user:u1', -1)).toBe('user:u1')
    expect(moveMessageSelection([], null, 1)).toBeNull()
  })
})
