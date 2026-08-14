import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { NoticeNode } from '../../../runtime/sessions/conversation.ts'
import { truncatePrompt } from '../store/format.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function scheduleNoticeMessage(data: unknown): string {
  if (!isRecord(data)) return '定时提醒已更新。'
  const operation = typeof data.operation === 'string' ? data.operation : undefined
  if (operation === 'create') {
    const schedule = isRecord(data.schedule) ? data.schedule : undefined
    const prompt = typeof schedule?.prompt === 'string' ? schedule.prompt.trim() : undefined
    return prompt === undefined || prompt === '' ? '已创建定时提醒。' : `已创建定时提醒：${truncatePrompt(prompt)}`
  }
  if (operation === 'delete') return '已删除定时提醒。'
  if (operation === 'dispatch') return '定时提醒已触发。'
  return '定时提醒已更新。'
}

export const scheduleNoticeNode: ConversationNodeDefinition<NoticeNode> = {
  kind: 'notice',
  match(event) {
    if (event.type !== 'schedule/change') return null
    return { id: `schedule:${String(event.seq)}`, role: 'start' }
  },
  start(match) {
    return {
      kind: 'notice',
      id: `notice:${String(match.event.seq)}`,
      seq: match.event.seq,
      time: match.event.time,
      tone: 'info',
      message: scheduleNoticeMessage(match.event.data),
      action: { label: '在自动化中查看', kind: 'open-automation' },
    }
  },
  update(state) {
    return state
  },
  buildViewNode(context) {
    return context.state
  },
}
