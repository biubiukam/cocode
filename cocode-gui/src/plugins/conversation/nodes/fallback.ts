import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { FallbackNode } from '../../../runtime/sessions/conversation.ts'

export const fallbackNode: ConversationNodeDefinition<FallbackNode> = {
  kind: 'fallback',
  fallback: true,
  match(event) {
    return { id: `fallback:${String(event.seq)}`, role: 'start' }
  },
  start(match) {
    return {
      kind: 'fallback',
      id: `fallback:${String(match.event.seq)}`,
      seq: match.event.seq,
      time: match.event.time,
      eventType: match.event.type,
    }
  },
  update(state) {
    return state
  },
  buildViewNode() {
    // Unknown wire types stay in Trajectory; the thread does not surface raw event names.
    return null
  },
}
