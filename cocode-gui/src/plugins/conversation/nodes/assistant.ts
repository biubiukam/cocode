import type { AssistantChunkData, AssistantMessageData } from '@cocode/gui-connection'
import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import { blocksToText, reasoningToText, type AssistantNode } from '../../../runtime/sessions/conversation.ts'

export const assistantNode: ConversationNodeDefinition<AssistantNode> = {
  kind: 'assistant',
  match(event) {
    if (event.type === 'assistant/chunk' || event.type === 'assistant/message') {
      const data = event.data as AssistantChunkData | AssistantMessageData
      const role = event.type === 'assistant/chunk' ? 'start' : 'update'
      return { id: `${String(data.turn)}:${String(data.step)}`, role }
    }
    return null
  },
  start(match) {
    const data = match.event.data as AssistantChunkData | AssistantMessageData
    const node: AssistantNode = {
      kind: 'assistant',
      id: `assistant:${String(data.turn)}:${String(data.step)}`,
      seq: match.event.seq,
      time: match.event.time,
      turn: data.turn,
      step: data.step,
      text: '',
      reasoning: '',
      streaming: match.event.type === 'assistant/chunk',
    }
    return applyAssistant(node, match)
  },
  update(state, match) {
    return applyAssistant({ ...state }, match)
  },
  publication(match) {
    if (match.event.type !== 'assistant/chunk') return 'immediate'
    const chunk = (match.event.data as AssistantChunkData).chunk
    if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return 'frame'
    return 'none'
  },
  buildViewNode(context) {
    const state = context.state
    if (state.text === '' && state.reasoning === '' && !state.streaming) return null
    return state
  },
}

function applyAssistant(node: AssistantNode, match: { event: { type: string; data: unknown } }): AssistantNode {
  if (match.event.type === 'assistant/chunk') {
    const { chunk } = match.event.data as AssistantChunkData
    if (chunk.type === 'text-delta') node.text += chunk.text
    else if (chunk.type === 'reasoning-delta') node.reasoning += chunk.text
    else if (chunk.type === 'usage') node.usage = chunk.usage
    node.streaming = true
    return node
  }
  const data = match.event.data as AssistantMessageData
  node.text = blocksToText(data.message.content)
  node.reasoning = reasoningToText(data.message.content)
  node.streaming = false
  if (data.usage !== undefined) node.usage = data.usage
  return node
}
