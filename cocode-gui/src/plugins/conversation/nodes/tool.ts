import type { ContentBlock, ToolCallData, ToolResultBlock, ToolResultData } from '@cocode/gui-connection'
import type { ConversationMatch, ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { ToolNode } from '../../../runtime/sessions/conversation.ts'

export const toolNode: ConversationNodeDefinition<ToolNode> = {
  kind: 'tool',
  match(event) {
    if (event.type === 'tool/call') {
      return { id: (event.data as ToolCallData).callId, role: 'start' }
    }
    if (event.type === 'tool/result') {
      return { id: (event.data as ToolResultData).message.source.callId, role: 'update' }
    }
    return null
  },
  start(match) {
    const data = match.event.data as ToolCallData
    const view = match.view?.for === 'call' ? match.view.view : undefined
    return {
      kind: 'tool',
      id: `tool:${data.callId}`,
      seq: match.event.seq,
      time: match.event.time,
      callId: data.callId,
      name: data.name,
      args: data.arguments,
      status: 'running',
      callView: view,
    }
  },
  update(state, match) {
    return applyToolResult({ ...state }, match)
  },
  buildViewNode(context) {
    return context.state
  },
}

function applyToolResult(node: ToolNode, match: ConversationMatch): ToolNode {
  const data = match.event.data as ToolResultData
  const view = match.view?.for === 'result' ? match.view.view : undefined
  const block = data.message.content[0]
  const isError = data.error !== undefined
    || (block !== undefined && block.type === 'tool-result' && block.isError === true)
  node.status = isError ? 'error' : 'success'
  node.resultView = view
  const resultBlock = block?.type === 'tool-result' ? (block as ToolResultBlock) : undefined
  node.resultBlocks = resultBlock?.content ?? (data.message.content as ContentBlock[])
  node.error = data.error
  node.approval = undefined
  node.finishedAt = match.event.time
  return node
}
