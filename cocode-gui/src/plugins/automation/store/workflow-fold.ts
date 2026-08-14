/**
 * Folds `tool-workflow/*` session events into list rows.
 * Authority is the session log; live-ness comes from `host/workflows`.
 */

import type { SessionEvent, SessionId } from '@cocode/gui-connection'
import type { WorkflowAgentSummary, WorkflowRow, WorkflowRunStatus } from './types.ts'

type Draft = {
  sessionId: SessionId
  runId: string
  name: string
  agentsStarted: number
  agents: WorkflowAgentSummary[]
  stopReason?: 'completed' | 'cancelled' | 'error'
}

function asRecord(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {}
  return data as Record<string, unknown>
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function stopReasonOf(value: unknown): 'completed' | 'cancelled' | 'error' | undefined {
  if (value === 'completed' || value === 'cancelled' || value === 'error') return value
  return undefined
}

function statusOf(draft: Draft, live: boolean): WorkflowRunStatus {
  if (draft.stopReason !== undefined) return draft.stopReason
  return live ? 'running' : 'interrupted'
}

export function foldWorkflows(
  sessionId: SessionId,
  events: readonly SessionEvent[],
  liveIds: ReadonlySet<string>,
): WorkflowRow[] {
  const drafts = new Map<string, Draft>()
  for (const event of events) {
    if (!event.type.startsWith('tool-workflow/')) continue
    const data = asRecord(event.data)
    const runId = text(data.runId) ?? text(data.run_id)
    if (runId === undefined) continue
    const current = drafts.get(runId) ?? {
      sessionId,
      runId,
      name: text(data.name) ?? runId,
      agentsStarted: 0,
      agents: [],
    }
    if (event.type === 'tool-workflow/run-start') {
      current.name = text(data.name) ?? current.name
    }
    if (event.type === 'tool-workflow/agent-start') {
      current.agentsStarted += 1
      current.agents.push({
        seq: event.seq,
        label: text(data.name) ?? text(data.agent) ?? 'agent',
        phase: 'started',
        childId: text(data.childId) ?? text(data.sessionId),
      })
    }
    if (event.type === 'tool-workflow/agent-end') {
      const childId = text(data.childId) ?? text(data.sessionId)
      const last = [...current.agents].reverse().find(agent => childId === undefined || agent.childId === childId)
      if (last !== undefined) {
        last.phase = 'ended'
        last.outcome = text(data.outcome) ?? text(data.stopReason)
      }
    }
    if (event.type === 'tool-workflow/run-end') {
      current.stopReason = stopReasonOf(data.stopReason) ?? stopReasonOf(data.reason) ?? 'completed'
    }
    drafts.set(runId, current)
  }
  return [...drafts.values()].map(draft => {
    const live = liveIds.has(`${sessionId}:${draft.runId}`)
    return {
      sessionId: draft.sessionId,
      runId: draft.runId,
      name: draft.name,
      status: statusOf(draft, live),
      live,
      agentsStarted: draft.agentsStarted,
      agents: draft.agents,
      stopReason: draft.stopReason,
    }
  })
}
