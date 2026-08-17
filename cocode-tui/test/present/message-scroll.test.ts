import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import {
  maxMessageScrollOffset,
  resolveMessageWindow,
  scrollOffsetForMessage,
  transcriptPaintColumns,
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
    expect(visibleMessageWindow(nodes, 4, false, undefined, 2).map((node) => node.id)).toEqual([
      '1',
      '2',
    ])
  })

  it('tracks rows hidden inside one message that is taller than the viewport', () => {
    const nodes = [user('1', '1\n2\n3\n4\n5\n6\n7\n8')]

    expect(resolveMessageWindow(nodes, 4, false, undefined, 0).hiddenRowsBefore).toBe(5)
    expect(resolveMessageWindow(nodes, 4, false, undefined, 3).hiddenRowsBefore).toBe(2)
  })

  it('counts terminal wrapping when calculating the scroll range', () => {
    const nodes = [user('1', 'abcdefghij')]

    expect(maxMessageScrollOffset(nodes, 3, false, undefined, 5)).toBeGreaterThan(0)
  })

  it('reserves a scrollbar column only once the transcript overflows', () => {
    const nodes = [user('1', 'hello')]
    const long = Array.from({ length: 8 }, (_, index) => user(String(index + 1), 'hello'))

    expect(transcriptPaintColumns(nodes, 6, false, undefined, 40)).toBe(40)
    expect(transcriptPaintColumns(long, 6, false, undefined, 40)).toBe(39)
  })

  it('reserves a selectable body row for an empty user message', () => {
    expect(maxMessageScrollOffset([user('1', '')], 2)).toBe(0)
  })

  it('moves the transcript when selection reaches an older hidden message', () => {
    const nodes = [user('1', 'one'), user('2', 'two'), user('3', 'three')]

    expect(scrollOffsetForMessage(nodes, 4, 'user:1')).toBeGreaterThan(0)
  })

  it('returns an empty window when compact mode hides every node', () => {
    const hidden: ConversationNode = {
      kind: 'notice',
      id: '1',
      seq: 1,
      time: 1,
      tone: 'info',
      message: 'turn/start',
      verboseOnly: true,
    }

    expect(resolveMessageWindow([hidden], 10).nodes).toEqual([])
    expect(resolveMessageWindow([hidden], 10, true).nodes).toEqual([hidden])
  })
})
