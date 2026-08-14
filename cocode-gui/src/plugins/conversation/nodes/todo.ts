import type { TodoItem, TodoWriteData } from '@cocode/gui-connection'
import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'

export const todoNode: ConversationNodeDefinition<{ todos: readonly TodoItem[] }> = {
  kind: 'todo',
  match(event) {
    if (event.type !== 'todo/write') return null
    return { id: 'session', role: 'start' }
  },
  start(match) {
    return { todos: (match.event.data as TodoWriteData).todos }
  },
  update(_state, match) {
    return { todos: (match.event.data as TodoWriteData).todos }
  },
  buildViewNode() {
    return null
  },
}
