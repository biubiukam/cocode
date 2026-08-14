import type { HostFrame } from '@cocode/gui-connection'
import type { Context } from '@deepseek-ai/cordis'
import { AutomationStore } from './store/store.ts'
import { scheduleNoticeNode } from './nodes/schedule-notice.ts'
import { AutomationPage } from './ui/automation-page.tsx'
import { ScheduleHeaderBadge } from './ui/header-badge.tsx'
import { ManagementLink } from '../../shell/sidebar/management-link.tsx'

export const name = 'automation'
export const inject = ['slots', 'sessions', 'nodes', 'connection']

export function apply(ctx: Context) {
  const store = new AutomationStore(
    () => ctx.root.get('connection')?.activeTransport,
    ctx.get('sessions')!,
    () => ctx.root.get('connection')?.state.get().description?.capabilities,
  )
  ctx.reflect.provide('automation', store)

  ctx.nodes.register(scheduleNoticeNode)

  ctx.sessions.route('host/schedules', ({ frame }) => {
    store.receiveSchedules((frame as Extract<HostFrame, { type: 'host/schedules' }>).items)
  })
  ctx.sessions.route('host/workflows', ({ frame }) => {
    store.receiveWorkflows((frame as Extract<HostFrame, { type: 'host/workflows' }>).items)
  })

  ctx.on('connection/ready', () => { store.onConnectionReady() })
  ctx.on('connection/lost', () => { store.onConnectionLost() })
  if (ctx.get('connection')?.state.get().phase === 'ready') store.onConnectionReady()

  ctx.slots.register({ name: 'center.view', key: 'automation' }, AutomationPage)
  ctx.slots.register({
    name: 'sidebar.management',
    order: 10,
    inject: () => ({
      view: 'automation',
      label: '自动化',
      icon: 'zap',
    }),
  }, ManagementLink)
  ctx.slots.register({
    name: 'shell.palette',
    order: 20,
    inject: () => ({
      id: 'center.automation',
      label: '打开自动化',
      group: '导航',
      icon: 'zap',
      run: () => { ctx.get('layout')?.store.getState().setCenterView('automation') },
    }),
  }, Empty)
  ctx.slots.register({
    name: 'shell.palette',
    order: 21,
    inject: () => ({
      id: 'automation.create-schedule',
      label: '新建定时任务',
      group: '动作',
      icon: 'zap',
      run: () => {
        store.requestCreate()
        ctx.get('layout')?.store.getState().setCenterView('automation')
      },
    }),
  }, Empty)
  ctx.slots.register({
    name: 'conversation.header.actions',
    order: 5,
  }, ScheduleHeaderBadge)
}

function Empty() {
  return null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    automation: AutomationStore
  }
}
