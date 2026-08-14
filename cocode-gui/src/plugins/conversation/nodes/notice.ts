import type { TurnEndData } from '@cocode/gui-connection'
import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { NoticeNode } from '../../../runtime/sessions/conversation.ts'

export const turnEndNode: ConversationNodeDefinition<NoticeNode | { silent: true }> = {
  kind: 'notice',
  match(event) {
    if (event.type !== 'turn/end') return null
    return { id: `turn-end:${String(event.seq)}`, role: 'start' }
  },
  start(match) {
    const data = match.event.data as TurnEndData
    const reason = data.reason.kind
    if (reason === 'stop' || reason === 'tool-calls' || reason === 'completed') return { silent: true }
    const failure = data.reason as { failure?: { message?: string } }
    const message = reason === 'aborted'
      ? '本轮已被取消。'
      : reason === 'max-tokens'
        ? '本轮达到输出长度上限而停止。'
        : failure.failure?.message ?? `本轮以 ${reason} 结束。`
    return {
      kind: 'notice',
      id: `notice:${String(match.event.seq)}`,
      seq: match.event.seq,
      time: match.event.time,
      tone: reason === 'error' ? 'error' : 'info',
      message,
    }
  },
  update(state) {
    return state
  },
  buildViewNode(context) {
    const state = context.state
    if ('silent' in state) return null
    return state
  },
}
