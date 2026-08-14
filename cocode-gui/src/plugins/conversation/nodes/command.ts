import type { CommandDoneData, CommandRunData } from '@cocode/gui-connection'
import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { CommandNode } from '../../../runtime/sessions/conversation.ts'

export const commandNode: ConversationNodeDefinition<CommandNode> = {
  kind: 'command',
  match(event) {
    if (event.type === 'command/run') {
      return { id: (event.data as CommandRunData).commandId, role: 'start' }
    }
    if (event.type === 'command/done') {
      return { id: (event.data as CommandDoneData).commandId, role: 'update' }
    }
    return null
  },
  start(match) {
    const data = match.event.data as CommandRunData
    return {
      kind: 'command',
      id: `command:${data.commandId}`,
      seq: match.event.seq,
      time: match.event.time,
      name: data.name,
      args: data.args,
      status: 'running',
    }
  },
  update(state, match) {
    const data = match.event.data as CommandDoneData
    return {
      ...state,
      status: data.kind === 'error' ? 'error' : 'success',
      text: data.text,
    }
  },
  buildViewNode(context) {
    return context.state
  },
}
