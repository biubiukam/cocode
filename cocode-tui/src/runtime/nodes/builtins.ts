/**
 * P0 built-in Definitions. Type checks live only in match().
 */

import type { SessionEvent } from '@cocode/tui-connection'
import { asNumber, asString, blocksToText, isRecord, reasoningToText } from '../text.ts'
import type { AssistantNode, NodeDefinition, NoticeNode, ToolNode, UserNode } from './types.ts'
import { NodeRegistry } from './registry.ts'
import { inferToolView } from './tool-view.ts'

export function createBuiltinRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  registry.register(userDefinition)
  registry.register(assistantDefinition)
  registry.register(toolDefinition)
  registry.register(fallbackDefinition)
  return registry
}

const userDefinition: NodeDefinition<UserNode> = {
  kind: 'user',
  match(event) {
    if (event.type !== 'user/message') return null
    const data = isRecord(event.data) ? event.data : {}
    const id = asString(data.id, String(event.seq))
    return { id, role: 'start' }
  },
  start(event) {
    const data = isRecord(event.data) ? event.data : {}
    return {
      kind: 'user',
      id: asString(data.id, String(event.seq)),
      seq: event.seq,
      time: event.time,
      text: blocksToText(data.content),
    }
  },
  update(state) {
    return state
  },
  isComplete() {
    return true
  },
  buildViewNode(ctx) {
    return ctx.state
  },
}

const assistantDefinition: NodeDefinition<AssistantNode> = {
  kind: 'assistant',
  match(event) {
    if (event.type !== 'assistant/chunk' && event.type !== 'assistant/message') {
      return null
    }
    const data = isRecord(event.data) ? event.data : {}
    const id = `${asNumber(data.turn)}:${asNumber(data.step)}`
    const role = event.type === 'assistant/chunk' ? 'start' : 'update'
    return { id, role }
  },
  start(event) {
    const data = isRecord(event.data) ? event.data : {}
    const node: AssistantNode = {
      kind: 'assistant',
      id: `${asNumber(data.turn)}:${asNumber(data.step)}`,
      seq: event.seq,
      time: event.time,
      turn: asNumber(data.turn),
      step: asNumber(data.step),
      text: '',
      reasoning: '',
      streaming: event.type === 'assistant/chunk',
    }
    return applyAssistant(node, event)
  },
  update(state, event) {
    return applyAssistant({ ...state }, event)
  },
  isComplete(state) {
    return !state.streaming
  },
  buildViewNode(ctx) {
    const state = ctx.state
    if (state.text === '' && state.reasoning === '' && !state.streaming) {
      return null
    }
    return state
  },
}

function applyAssistant(node: AssistantNode, event: SessionEvent): AssistantNode {
  const data = isRecord(event.data) ? event.data : {}
  if (event.type === 'assistant/chunk') {
    const chunk = isRecord(data.chunk) ? data.chunk : {}
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      node.text += chunk.text
    } else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
      node.reasoning += chunk.text
    } else if (chunk.type === 'usage' && isRecord(chunk.usage)) {
      node.usage = usageOf(chunk.usage)
    }
    node.streaming = true
    return node
  }
  const message = isRecord(data.message) ? data.message : {}
  node.text = blocksToText(message.content)
  node.reasoning = reasoningToText(message.content)
  node.streaming = false
  if (isRecord(data.usage)) node.usage = usageOf(data.usage)
  return node
}

function usageOf(usage: Record<string, unknown>): {
  input: number
  output: number
} {
  return {
    input: asNumber(usage.inputTokens),
    output: asNumber(usage.outputTokens),
  }
}

const toolDefinition: NodeDefinition<ToolNode> = {
  kind: 'tool',
  match(event) {
    if (event.type === 'tool/call') {
      const data = isRecord(event.data) ? event.data : {}
      const id = asString(data.callId)
      if (id === '') return null
      return { id, role: 'start' }
    }
    if (event.type === 'tool/result') {
      const id = toolResultCallId(event)
      if (id === '') return null
      return { id, role: 'update' }
    }
    return null
  },
  start(event) {
    const data = isRecord(event.data) ? event.data : {}
    return {
      kind: 'tool',
      id: asString(data.callId),
      seq: event.seq,
      time: event.time,
      callId: asString(data.callId),
      name: asString(data.name, 'tool'),
      args: asString(data.arguments),
      status: 'running',
      view: inferToolView(asString(data.name, 'tool'), asString(data.arguments)),
    }
  },
  update(state, event) {
    return applyToolResult({ ...state }, event)
  },
  isComplete(state) {
    return state.status !== 'running'
  },
  buildViewNode(ctx) {
    return ctx.state
  },
}

function toolResultCallId(event: SessionEvent): string {
  const data = isRecord(event.data) ? event.data : {}
  const message = isRecord(data.message) ? data.message : {}
  const source = isRecord(message.source) ? message.source : {}
  if (typeof source.callId === 'string' && source.callId !== '') {
    return source.callId
  }
  const content = Array.isArray(message.content) ? message.content[0] : undefined
  if (isRecord(content) && typeof content.toolCallId === 'string') {
    return content.toolCallId
  }
  return ''
}

function applyToolResult(node: ToolNode, event: SessionEvent): ToolNode {
  const data = isRecord(event.data) ? event.data : {}
  const message = isRecord(data.message) ? data.message : {}
  const block = Array.isArray(message.content) ? message.content[0] : undefined
  const isError =
    data.error !== undefined ||
    (isRecord(block) && block.type === 'tool-result' && block.isError === true)
  node.status = isError ? 'error' : 'success'
  node.result = isRecord(block) ? blocksToText(block.content) : ''
  if (isRecord(data.error)) {
    node.error = {
      name: asString(data.error.name, 'Error'),
      code: asString(data.error.code, 'UNKNOWN'),
    }
  }
  return node
}

const fallbackDefinition: NodeDefinition<NoticeNode> = {
  kind: 'notice',
  fallback: true,
  match(event) {
    return { id: `fallback:${String(event.seq)}`, role: 'start' }
  },
  start(event) {
    return {
      kind: 'notice',
      id: `fallback:${String(event.seq)}`,
      seq: event.seq,
      time: event.time,
      tone: 'info',
      message: event.type,
      verboseOnly: true,
    }
  },
  update(state) {
    return state
  },
  isComplete() {
    return true
  },
  buildViewNode(ctx) {
    return ctx.state
  },
}
