import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { visibleMessageWindow } from '../../src/present/message-scroll.ts'

function user(id: string, text: string): ConversationNode {
  return { kind: 'user', id, seq: Number(id), time: Number(id), text }
}

describe('message scroll window', () => {
  it('shows the newest rows at the bottom and older rows after scrolling up', () => {
    const nodes = [user('1', 'one'), user('2', 'two'), user('3', 'three')]

    expect(visibleMessageWindow(nodes, 4, false, undefined, 0).map((node) => node.id)).toEqual([
      '2',
      '3',
    ])
    expect(visibleMessageWindow(nodes, 4, false, undefined, 3).map((node) => node.id)).toEqual([
      '1',
      '2',
    ])
  })
})
