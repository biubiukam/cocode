import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { visibleTail } from '../../src/present/visible-tail.ts'

function notice(id: string): ConversationNode {
  return {
    kind: 'notice',
    id,
    seq: Number(id),
    time: Number(id),
    tone: 'info',
    message: id,
  }
}

describe('visibleTail', () => {
  it('keeps the newest nodes within the row budget', () => {
    const nodes = [notice('1'), notice('2'), notice('3')]
    expect(visibleTail(nodes, 2).map((node) => node.id)).toEqual(['2', '3'])
  })

  it('does not render hidden notices in compact mode', () => {
    const hidden: ConversationNode = {
      ...notice('1'),
      verboseOnly: true,
    }
    expect(visibleTail([hidden, notice('2')], 1)).toEqual([notice('2')])
  })

  it('budgets expanded tool rows as detailed content', () => {
    const tool: ConversationNode = {
      kind: 'tool',
      id: 'tool-1',
      seq: 1,
      time: 1,
      callId: 'call-1',
      name: 'read',
      args: '{"path":"README.md"}',
      status: 'success',
      result: 'line one\nline two',
    }
    expect(visibleTail([tool, notice('2')], 6, false, new Set(['tool:tool-1']))).toHaveLength(2)
    expect(visibleTail([tool, notice('2')], 2)).toEqual([notice('2')])
  })
})
