import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import {
  messageSupportsDetails,
  moveMessageSelection,
  pruneExpandedMessageKeys,
  selectableMessageKeys,
  toggleMessageDetails,
} from '../../src/present/message-selection.ts'

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
  it('selects every visible conversation node, including notices', () => {
    expect(selectableMessageKeys([user, tool, notice])).toEqual([
      'user:u1',
      'tool:t1',
      'notice:n1',
    ])
  })

  it('moves within the list and clamps at both ends', () => {
    const keys = ['user:u1', 'tool:t1']
    expect(moveMessageSelection(keys, null, -1)).toBe('user:u1')
    expect(moveMessageSelection(keys, 'tool:t1', 1)).toBe('tool:t1')
    expect(moveMessageSelection(keys, 'user:u1', -1)).toBe('user:u1')
    expect(moveMessageSelection([], null, 1)).toBeNull()
  })

  it('only toggles nodes that have real detail payloads', () => {
    const assistant: ConversationNode = {
      kind: 'assistant',
      id: 'a1',
      seq: 4,
      time: 4,
      turn: 1,
      step: 0,
      text: 'done',
      reasoning: 'full reasoning',
      streaming: false,
    }
    const context: ConversationNode = {
      kind: 'context',
      id: 'c1',
      seq: 5,
      time: 5,
      text: 'runtime context',
      source: {},
      provenance: { role: 'inject' },
      sections: [],
    }
    const detailedTool = { ...tool, args: '{"path":"README.md"}' }
    const nodes = [user, assistant, detailedTool, context, notice]
    const empty = new Set<string>()

    expect(messageSupportsDetails(user)).toBe(false)
    expect(messageSupportsDetails(notice)).toBe(false)
    expect(toggleMessageDetails(nodes, 'user:u1', empty)).toBe(empty)
    expect(toggleMessageDetails(nodes, 'notice:n1', empty)).toBe(empty)
    expect([...toggleMessageDetails(nodes, 'assistant:a1', empty)]).toEqual(['assistant:a1'])
    expect([...toggleMessageDetails(nodes, 'tool:t1', empty)]).toEqual(['tool:t1'])
    expect([...toggleMessageDetails(nodes, 'context:c1', empty)]).toEqual(['context:c1'])
  })

  it('leaves interactive tool details to their dedicated renderers', () => {
    const planTool: ConversationNode = {
      ...tool,
      id: 'plan-1',
      name: 'exit_plan_mode',
      args: '{"plan":"Already rendered"}',
    }
    const questionTool: ConversationNode = {
      ...tool,
      id: 'question-1',
      name: 'ask_user_question',
      args: '{"question":"Already rendered"}',
    }
    expect(messageSupportsDetails(planTool)).toBe(false)
    expect(messageSupportsDetails(questionTool)).toBe(false)
  })

  it('removes expanded keys whose nodes disappeared', () => {
    const expanded = new Set(['user:u1', 'tool:t1', 'assistant:gone'])
    expect([...pruneExpandedMessageKeys(expanded, [user, tool])]).toEqual([
      'user:u1',
      'tool:t1',
    ])
  })
})
