/**
 * Log-only session events folded out of the chat thread.
 * Trajectory still shows the raw wire; the thread only surfaces user-facing rows.
 */

import type { SessionEvent } from '@cocode/gui-connection'
import type { ConversationNodeDefinition } from '../../../runtime/nodes/types.ts'

/** Harness log-only types with no chat-row counterpart (see known-event-types). */
const FOLDED_TYPES = new Set([
  'agent-preset/selected',
  'agent/inbox/spliced',
  'approval/asked',
  'approval/decided',
  'approval/policy',
  'compaction/prune',
  'compaction/summary',
  'feedback/record',
  'goal/change',
  'hook/invoked',
  'hook/result',
  'llm/retry',
  'llm/retry-started',
  'permission/preset',
  'plan/mode',
  'request/context',
  'request/header',
  'sandbox/mode',
  'schedule/change',
  'session/end-seed',
  'session/title',
  'session/title-llm-request',
  'step/end',
  'step/start',
  'subagent/descriptor',
  'tool-workflow/agent-end',
  'tool-workflow/agent-start',
  'tool-workflow/run-end',
  'tool-workflow/run-start',
  'tool/code-dispatch',
  'tool/code-dispatch-start',
  'turn/start',
  'web/deepseek-search-llm-request',
])

function isFolded(event: SessionEvent): boolean {
  if (event.ignorable === true) return true
  if (FOLDED_TYPES.has(event.type)) return true
  if (event.type.startsWith('agent/inbox/')) return true
  return false
}

export const foldedNode: ConversationNodeDefinition<{ folded: true }> = {
  kind: 'folded',
  match(event) {
    if (!isFolded(event)) return null
    return { id: `folded:${String(event.seq)}`, role: 'start' }
  },
  start() {
    return { folded: true }
  },
  update(state) {
    return state
  },
  buildViewNode() {
    return null
  },
}
