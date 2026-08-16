import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import {
  maxMessageScrollOffset,
  resolveMessageWindow,
  scrollOffsetForMessage,
  visibleMessageWindow,
} from '../../src/present/message-scroll.ts'

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

  it('tracks rows hidden inside one message that is taller than the viewport', () => {
    const nodes = [user('1', '1\n2\n3\n4\n5\n6\n7\n8')]

    expect(resolveMessageWindow(nodes, 4, false, undefined, 0).hiddenRowsBefore).toBe(6)
    expect(resolveMessageWindow(nodes, 4, false, undefined, 3).hiddenRowsBefore).toBe(3)
  })

  it('counts terminal wrapping when calculating the scroll range', () => {
    const nodes = [user('1', 'abcdefghij')]

    expect(maxMessageScrollOffset(nodes, 3, false, undefined, 5)).toBeGreaterThan(0)
  })

  it('moves the transcript when selection reaches an older hidden message', () => {
    const nodes = [user('1', 'one'), user('2', 'two'), user('3', 'three')]

    expect(scrollOffsetForMessage(nodes, 4, 'user:1')).toBeGreaterThan(0)
  })
})
