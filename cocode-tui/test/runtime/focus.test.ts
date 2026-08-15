import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { findLastUserIndex, focusConversationNodes } from '../../src/runtime/focus.ts'

const nodes: readonly ConversationNode[] = [
  { kind: 'user', id: 'u1', seq: 1, time: 1, text: 'first' },
  {
    kind: 'assistant',
    id: 'a1',
    seq: 2,
    time: 2,
    turn: 1,
    step: 0,
    text: 'first answer',
    reasoning: '',
    streaming: false,
  },
  { kind: 'user', id: 'u2', seq: 3, time: 3, text: 'latest' },
  {
    kind: 'tool',
    id: 't2',
    seq: 4,
    time: 4,
    callId: 'call-2',
    name: 'read_file',
    args: '{}',
    status: 'success',
    result: 'ok',
  },
  {
    kind: 'assistant',
    id: 'a2',
    seq: 5,
    time: 5,
    turn: 2,
    step: 0,
    text: 'latest answer',
    reasoning: '',
    streaming: false,
  },
]

describe('focusConversationNodes', () => {
  it('returns the latest user turn and its following nodes', () => {
    expect(findLastUserIndex(nodes)).toBe(2)
    expect(focusConversationNodes(nodes, true)).toEqual(nodes.slice(2))
  })

  it('does not allocate or filter when focus is disabled', () => {
    expect(focusConversationNodes(nodes, false)).toBe(nodes)
  })

  it('shows an empty projection until a user turn exists', () => {
    const withoutUser = nodes.filter((node) => node.kind !== 'user')
    expect(findLastUserIndex(withoutUser)).toBe(-1)
    expect(focusConversationNodes(withoutUser, true)).toEqual([])
  })
})
