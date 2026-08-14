/**
 * Automation page snapshot types. Display rows are client projections over
 * harness wire views — no second persistence.
 */

import type {
  HostCapabilities,
  JobView,
  ScheduleListItem,
  SessionId,
  WorkspaceId,
} from '@cocode/gui-connection'

export type AutomationSegment = 'schedules' | 'jobs' | 'workflows'

/** Client filter; `active` means the currently selected session. */
export type AutomationSessionFilter = SessionId | 'active' | 'all'

export type ScheduleDisplayState = 'scheduled' | 'overdue'

export type ScheduleRow = ScheduleListItem & {
  /** Recomputed from wall clock at snapshot time; wire `state` is ignored for display. */
  displayState: ScheduleDisplayState
}

export type JobRow = JobView & {
  sessionId: SessionId
}

export type WorkflowRunStatus = 'running' | 'interrupted' | 'completed' | 'cancelled' | 'error'

export type WorkflowAgentSummary = {
  seq: number
  label: string
  phase?: string
  childId?: SessionId
  outcome?: string
}

export type WorkflowRow = {
  sessionId: SessionId
  runId: string
  name: string
  status: WorkflowRunStatus
  live: boolean
  agentsStarted: number
  agents: readonly WorkflowAgentSummary[]
  stopReason?: 'completed' | 'cancelled' | 'error'
}

export type AutomationSnapshot = {
  segment: AutomationSegment
  workspaceFilter: WorkspaceId | 'all'
  sessionFilter: AutomationSessionFilter
  capabilities: HostCapabilities
  schedules: readonly ScheduleRow[]
  jobs: readonly JobRow[]
  workflows: readonly WorkflowRow[]
  loading: boolean
  error?: string
  /** Opens the create dialog when set by the palette command. */
  pendingCreate: boolean
  /** Prefill for 「复制新建」 / palette create. */
  pendingDraft?: ScheduleCreateInput
  /** Soft focus: notice-row action pre-filters to this session. */
  focusSessionId?: SessionId
}

export type ScheduleCreateInput = {
  sessionId: SessionId
  prompt: string
  afterSeconds?: number
  at?: { date: string; time: string; timeZone: string }
  everySeconds?: number
}
