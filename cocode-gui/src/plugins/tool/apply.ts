import type { Context } from '@deepseek-ai/cordis'
import {
  DiffToolView, GenericToolView, ReadToolView, SearchToolView, TerminalToolView, WebToolView,
} from './ui/views.tsx'

export const name = 'tool'
export const inject = ['slots']

export function apply(ctx: Context) {
  ctx.slots.register({ name: 'conversation.tool.view', key: 'diff' }, DiffToolView)
  ctx.slots.register({ name: 'conversation.tool.view', key: 'terminal' }, TerminalToolView)
  ctx.slots.register({ name: 'conversation.tool.view', key: 'read' }, ReadToolView)
  ctx.slots.register({ name: 'conversation.tool.view', key: 'search' }, SearchToolView)
  ctx.slots.register({ name: 'conversation.tool.view', key: 'web' }, WebToolView)
  ctx.slots.register({ name: 'conversation.tool.view', key: 'generic' }, GenericToolView)
}
