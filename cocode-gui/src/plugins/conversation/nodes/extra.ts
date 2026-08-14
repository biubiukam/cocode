/**
 * Definitions for event families the wire may already carry.
 * No mock payloads — if the host never emits the type, the node never appears.
 */

import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'
import type { NoticeNode } from '../../../runtime/sessions/conversation.ts'

function noticeDefinition(
  kind: string,
  types: readonly string[],
  messageOf: (event: { type: string; data: unknown }) => string,
): ConversationNodeDefinition<NoticeNode> {
  return {
    kind,
    match(event) {
      if (!types.includes(event.type)) return null
      return { id: `${kind}:${String(event.seq)}`, role: 'start' }
    },
    start(match) {
      return {
        kind: 'notice',
        id: `${kind}:${String(match.event.seq)}`,
        seq: match.event.seq,
        time: match.event.time,
        tone: match.event.type.includes('error') ? 'error' : 'info',
        message: messageOf(match.event),
      }
    },
    update(state) {
      return state
    },
    buildViewNode(context) {
      return context.state
    },
  }
}

function textFrom(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data !== '') return data
  if (data !== null && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string' && message !== '') return message
  }
  return fallback
}

export const compactionNode = noticeDefinition(
  'compaction',
  ['compaction/start', 'compaction/end', 'context/compact'],
  event => textFrom(event.data, '上下文已压缩。'),
)

export const retryNode = noticeDefinition(
  'retry',
  ['turn/retry', 'assistant/retry'],
  event => textFrom(event.data, '正在重试本轮。'),
)

export const turnErrorNode = noticeDefinition(
  'turn-error',
  ['turn/error', 'assistant/error'],
  event => textFrom(event.data, '本轮出错。'),
)
