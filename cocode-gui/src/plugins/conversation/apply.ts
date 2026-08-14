import type { Context } from '@deepseek-ai/cordis'
import type { MuxFrame } from '@cocode/gui-connection'
import { Conversation } from '../../conversation/conversation.tsx'
import { userNode } from './nodes/user.ts'
import { assistantNode } from './nodes/assistant.ts'
import { toolNode } from './nodes/tool.ts'
import { turnEndNode } from './nodes/notice.ts'
import { todoNode } from './nodes/todo.ts'
import { commandNode } from './nodes/command.ts'
import { foldedNode } from './nodes/folded.ts'
import { fallbackNode } from './nodes/fallback.ts'
import { compactionNode, retryNode, turnErrorNode } from './nodes/extra.ts'
import {
  AssistantChatNode, CommandChatNode, FallbackChatNode, NoticeChatNode, ToolChatNode, UserChatNode,
} from './ui/nodes.tsx'
import { GoalUtility, QueueUtility, TodoUtility } from './ui/utilities.tsx'
import { QuestionComposer } from './ui/question.tsx'
import { HeaderDockActions } from './ui/header-actions.tsx'
import { ComposerLeading, ComposerTrailing } from './ui/composer-controls.tsx'

export const name = 'conversation'
export const inject = ['slots', 'nodes', 'sessions', 'shortcuts', 'commands']

export function apply(ctx: Context) {
  ctx.nodes.register(userNode)
  ctx.nodes.register(assistantNode)
  ctx.nodes.register(toolNode)
  ctx.nodes.register(turnEndNode)
  ctx.nodes.register(todoNode)
  ctx.nodes.register(commandNode)
  ctx.nodes.register(compactionNode)
  ctx.nodes.register(retryNode)
  ctx.nodes.register(turnErrorNode)
  ctx.nodes.register(foldedNode)
  ctx.nodes.register(fallbackNode)

  ctx.sessions.route('session/event', ({ session, frame }) => {
    const event = frame as Extract<MuxFrame, { type: 'session/event' }>
    session?.receiveEvent(event.event, event.view)
  })
  ctx.sessions.route('session/subscribed', ({ session, frame }) => {
    session?.receiveSubscribed((frame as Extract<MuxFrame, { type: 'session/subscribed' }>).lastSeq)
  })
  ctx.sessions.route('session/queue', ({ session, frame }) => {
    session?.receiveQueue((frame as Extract<MuxFrame, { type: 'session/queue' }>).items)
  })
  ctx.sessions.route('session/jobs', ({ session, frame }) => {
    session?.receiveJobs((frame as Extract<MuxFrame, { type: 'session/jobs' }>).jobs)
  })
  ctx.sessions.route('session/projection', ({ session, frame }) => {
    const projection = frame as Extract<MuxFrame, { type: 'session/projection' }>
    session?.receiveProjection(projection.key, projection.value, projection.seq)
  })
  ctx.sessions.route('approval/requested', ({ session, rpcId, frame }) => {
    const requested = frame as Extract<MuxFrame, { type: 'approval/requested' }>
    session?.receiveApprovalRequested(rpcId, requested)
  })
  ctx.sessions.route('approval/resolved', ({ session, frame }) => {
    session?.receiveApprovalResolved((frame as Extract<MuxFrame, { type: 'approval/resolved' }>).approvalId)
  })
  ctx.sessions.route('question/requested', ({ session, rpcId, frame }) => {
    session?.receiveQuestionRequested(rpcId, (frame as Extract<MuxFrame, { type: 'question/requested' }>).questions)
  })
  ctx.sessions.route('question/resolved', ({ session, frame }) => {
    session?.receiveQuestionResolved((frame as Extract<MuxFrame, { type: 'question/resolved' }>).questionRpcId)
  })

  ctx.slots.register({ name: 'center.view', key: 'conversation' }, Conversation)
  ctx.slots.register({ name: 'conversation.chat.node', key: 'user' }, UserChatNode)
  ctx.slots.register({ name: 'conversation.chat.node', key: 'assistant' }, AssistantChatNode)
  ctx.slots.register({ name: 'conversation.chat.node', key: 'tool' }, ToolChatNode)
  ctx.slots.register({ name: 'conversation.chat.node', key: 'notice' }, NoticeChatNode)
  ctx.slots.register({ name: 'conversation.chat.node', key: 'command' }, CommandChatNode)
  ctx.slots.register({ name: 'conversation.chat.node', key: 'fallback' }, FallbackChatNode)
  ctx.slots.register({ name: 'conversation.utilities', order: 10 }, GoalUtility)
  ctx.slots.register({ name: 'conversation.utilities', order: 20 }, TodoUtility)
  ctx.slots.register({ name: 'conversation.utilities', order: 30 }, QueueUtility)
  ctx.slots.register({ name: 'conversation.composer', order: 10 }, QuestionComposer)
  ctx.slots.register({ name: 'conversation.header.actions', order: 10 }, HeaderDockActions)
  ctx.slots.register({ name: 'conversation.composer.leading', order: 10 }, ComposerLeading)
  ctx.slots.register({ name: 'conversation.composer.trailing', order: 10 }, ComposerTrailing)

  ctx.shortcuts.register({
    id: 'session.new',
    description: '新建任务',
    combo: { key: 'n', primary: true },
    browserCombo: false,
    run: () => {
      const sessions = ctx.get('sessions')
      const layout = ctx.get('layout')
      if (sessions === undefined || layout === undefined) return false
      layout.store.getState().setCenterView('conversation')
      void sessions.createSession(sessions.activeWorkspaceId())
      return true
    },
  })

  ctx.slots.register({
    name: 'shell.palette',
    order: 10,
    inject: () => ({
      id: 'session.new',
      label: '新建任务',
      group: '动作',
      hint: ctx.get('shortcuts')?.list().find(row => row.definition.id === 'session.new')?.label,
      icon: 'plus',
      run: () => {
        ctx.get('layout')?.store.getState().setCenterView('conversation')
        const sessions = ctx.get('sessions')
        void sessions?.createSession(sessions.activeWorkspaceId())
      },
    }),
  }, PaletteItem)
}

function PaletteItem() {
  return null
}
