import type { Message } from '@cocode/gui-connection'
import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { UserNode } from '../../../runtime/sessions/conversation.ts'

export const userNode: ConversationNodeDefinition<UserNode> = {
  kind: 'user',
  match(event) {
    if (event.type !== 'user/message') return null
    const message = event.data as Message
    return { id: message.id, role: 'start' }
  },
  start(match) {
    const message = match.event.data as Message
    return {
      kind: 'user',
      id: `user:${message.id}`,
      seq: match.event.seq,
      time: match.event.time,
      blocks: message.content,
      synthetic: message.source.kind !== 'user',
    }
  },
  update(state) {
    return state
  },
  buildViewNode(context) {
    return context.state
  },
}
