/**
 * Automation directories. Schedule list is host-authoritative when the method
 * exists; jobs and workflows are projections over sessions the GUI already has.
 */

import type {
  HarnessTransport,
  HostCapabilities,
  ScheduleListItem,
  SessionId,
  WorkflowRunView,
  WorkspaceId,
} from '@cocode/gui-connection'
import { Observable } from '../../../runtime/notifier.ts'
import type { SessionStore } from '../../../runtime/sessions/session-store.ts'
import { nextScheduleRefreshAt, scheduleDisplayState } from './format.ts'
import type {
  AutomationSegment,
  AutomationSessionFilter,
  AutomationSnapshot,
  JobRow,
  ScheduleCreateInput,
  ScheduleRow,
  WorkflowRow,
} from './types.ts'
import { isCapabilityUnavailable, isNotRunning } from './unavailable.ts'
import { foldWorkflows } from './workflow-fold.ts'

function emptyCapabilities(): HostCapabilities {
  return {}
}

function emptySnapshot(): AutomationSnapshot {
  return {
    segment: 'schedules',
    workspaceFilter: 'all',
    sessionFilter: 'all',
    capabilities: emptyCapabilities(),
    schedules: [],
    jobs: [],
    workflows: [],
    loading: false,
    pendingCreate: false,
  }
}

export class AutomationStore {
  readonly state = new Observable<AutomationSnapshot>(emptySnapshot())

  private schedules: readonly ScheduleListItem[] = []
  private liveWorkflows: readonly WorkflowRunView[] = []
  private scheduleAvailable = false
  private scheduleProbed = false
  private jobMutationsUnavailable = false
  private workflowMutationsUnavailable = false
  private sessionUnsubs: (() => void)[] = []
  private refreshTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly getTransport: () => HarnessTransport | undefined,
    private readonly sessions: SessionStore,
    private readonly getDeclaredCapabilities: () => HostCapabilities | undefined,
  ) {
    this.sessions.subscribe(() => this.watchSessions())
  }

  onConnectionReady(): void {
    this.resetDirectories()
    this.watchSessions()
    void this.refreshSchedules()
    // Seed workflow folds from durable history (store starts on ready, not lazy).
    for (const summary of this.sessions.listVisibleSummaries()) {
      void this.sessions.session(summary.sessionId).loadHistory().then(() => this.publish())
    }
  }

  onConnectionLost(): void {
    this.resetDirectories()
    this.publish()
  }

  setSegment(segment: AutomationSegment): void {
    this.patch({ segment })
  }

  setWorkspaceFilter(workspaceFilter: WorkspaceId | 'all'): void {
    this.state.set({ ...this.state.get(), workspaceFilter, sessionFilter: 'all', focusSessionId: undefined })
    this.publish()
  }

  setSessionFilter(sessionFilter: AutomationSessionFilter): void {
    this.state.set({ ...this.state.get(), sessionFilter, focusSessionId: undefined })
    this.publish()
  }

  requestCreate(draft?: ScheduleCreateInput): void {
    this.state.set({
      ...this.state.get(),
      segment: 'schedules',
      pendingCreate: true,
      pendingDraft: draft,
    })
    this.publish()
  }

  requestCopy(row: ScheduleRow): void {
    const draft: ScheduleCreateInput = { sessionId: row.sessionId, prompt: row.prompt }
    if (row.kind === 'after') draft.afterSeconds = row.afterSeconds
    else if (row.kind === 'every') draft.everySeconds = row.everySeconds
    else {
      const at = Date.parse(row.scheduledAt)
      if (Number.isFinite(at)) {
        const date = new Date(at)
        const pad = (value: number) => String(value).padStart(2, '0')
        draft.at = {
          date: `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
          time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      }
    }
    this.requestCreate(draft)
  }

  /** Consumes the palette/open flag without dropping a prefill draft. */
  acknowledgeCreateRequest(): void {
    if (!this.state.get().pendingCreate) return
    this.state.set({ ...this.state.get(), pendingCreate: false })
    this.publish()
  }

  clearPendingCreate(): void {
    const current = this.state.get()
    if (!current.pendingCreate && current.pendingDraft === undefined) return
    this.state.set({ ...current, pendingCreate: false, pendingDraft: undefined })
    this.publish()
  }

  /** Open automation focused on one session (notice-row action). */
  focusSession(sessionId: SessionId): void {
    this.state.set({
      ...this.state.get(),
      segment: 'schedules',
      workspaceFilter: 'all',
      sessionFilter: sessionId,
      focusSessionId: sessionId,
    })
    this.publish()
  }

  /** Unfiltered schedule count for the session header badge. */
  scheduleCountFor(sessionId: SessionId): number {
    return this.schedules.filter(item => item.sessionId === sessionId).length
  }

  receiveSchedules(items: readonly ScheduleListItem[]): void {
    this.scheduleProbed = true
    this.scheduleAvailable = true
    this.schedules = items
    this.publish()
  }

  receiveWorkflows(items: readonly WorkflowRunView[]): void {
    this.workflowMutationsUnavailable = false
    this.liveWorkflows = items
    this.publish()
  }

  async createSchedule(input: ScheduleCreateInput): Promise<string | undefined> {
    if (input.afterSeconds !== undefined && (!Number.isFinite(input.afterSeconds) || input.afterSeconds < 1)) {
      return '延迟至少 1 秒。'
    }
    if (input.everySeconds !== undefined && (!Number.isFinite(input.everySeconds) || input.everySeconds < 300)) {
      return '重复间隔至少 300 秒。'
    }
    const transport = this.getTransport()
    if (transport === undefined) return '没有可用的连接。'
    const result = await transport.call('schedule.create', {
      sessionId: input.sessionId,
      prompt: input.prompt,
      ...(input.afterSeconds === undefined ? {} : { afterSeconds: input.afterSeconds }),
      ...(input.at === undefined ? {} : { at: input.at }),
      ...(input.everySeconds === undefined ? {} : { everySeconds: input.everySeconds }),
    })
    if (result.ok) {
      this.schedules = [...this.schedules.filter(item => item.id !== result.value.schedule.id), result.value.schedule]
      this.state.set({ ...this.state.get(), pendingCreate: false, pendingDraft: undefined })
      this.publish()
      return undefined
    }
    if (isCapabilityUnavailable(result.error)) {
      this.scheduleAvailable = false
      this.publish()
    }
    return result.error.message
  }

  async deleteSchedule(sessionId: SessionId, id: string): Promise<string | undefined> {
    const transport = this.getTransport()
    if (transport === undefined) return '没有可用的连接。'
    const result = await transport.call('schedule.delete', { sessionId, id })
    if (result.ok) {
      this.schedules = this.schedules.filter(item => item.id !== id)
      this.publish()
      return undefined
    }
    if (isCapabilityUnavailable(result.error)) {
      this.scheduleAvailable = false
      this.publish()
    }
    return result.error.message
  }

  async killJob(sessionId: SessionId, jobId: string): Promise<string | undefined> {
    const transport = this.getTransport()
    if (transport === undefined) return '没有可用的连接。'
    const result = await transport.call('job.kill', { sessionId, jobId })
    if (result.ok) {
      this.jobMutationsUnavailable = false
      this.publish()
      return undefined
    }
    if (isCapabilityUnavailable(result.error)) {
      this.jobMutationsUnavailable = true
      this.publish()
    }
    return result.error.message
  }

  async readJobOutput(sessionId: SessionId, jobId: string): Promise<{ text: string } | { error: string }> {
    const transport = this.getTransport()
    if (transport === undefined) return { error: '没有可用的连接。' }
    const result = await transport.call('job.output', { sessionId, jobId })
    if (result.ok) {
      this.jobMutationsUnavailable = false
      return { text: result.value.text }
    }
    if (isCapabilityUnavailable(result.error)) {
      this.jobMutationsUnavailable = true
      this.publish()
    }
    return { error: result.error.message }
  }

  async cancelWorkflow(sessionId: SessionId, runId: string): Promise<string | undefined> {
    const transport = this.getTransport()
    if (transport === undefined) return '没有可用的连接。'
    const result = await transport.call('workflow.cancel', { sessionId, runId })
    if (result.ok || isNotRunning(result.error)) {
      this.liveWorkflows = this.liveWorkflows.filter(item => !(item.sessionId === sessionId && item.runId === runId))
      this.workflowMutationsUnavailable = false
      this.publish()
      return undefined
    }
    if (isCapabilityUnavailable(result.error)) {
      this.workflowMutationsUnavailable = true
      this.publish()
    }
    return result.error.message
  }

  canMutateJobs(): boolean {
    if (this.getDeclaredCapabilities()?.jobs === false) return false
    return !this.jobMutationsUnavailable
  }

  canCancelWorkflows(): boolean {
    if (this.getDeclaredCapabilities()?.workflow === false) return false
    return !this.workflowMutationsUnavailable
  }

  private async refreshSchedules(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) {
      this.publish()
      return
    }
    this.patch({ loading: true, error: undefined })
    const result = await transport.call('schedule.list', {})
    if (result.ok) {
      this.scheduleProbed = true
      this.scheduleAvailable = true
      this.schedules = result.value.items
      this.patch({ loading: false, error: undefined })
      return
    }
    this.scheduleProbed = true
    if (isCapabilityUnavailable(result.error)) {
      this.scheduleAvailable = false
      this.schedules = []
      this.patch({ loading: false, error: undefined })
      return
    }
    this.patch({ loading: false, error: result.error.message })
  }

  private watchSessions(): void {
    for (const unsubscribe of this.sessionUnsubs) unsubscribe()
    this.sessionUnsubs = []
    for (const summary of this.sessions.listVisibleSummaries()) {
      const session = this.sessions.session(summary.sessionId)
      this.sessionUnsubs.push(session.subscribe(() => this.publish()))
    }
    this.publish()
  }

  private resetDirectories(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
    this.schedules = []
    this.liveWorkflows = []
    this.scheduleProbed = false
    this.scheduleAvailable = this.getDeclaredCapabilities()?.schedule === true
    this.jobMutationsUnavailable = this.getDeclaredCapabilities()?.jobs === false
    this.workflowMutationsUnavailable = this.getDeclaredCapabilities()?.workflow === false
    const current = this.state.get()
    this.state.set({
      ...emptySnapshot(),
      segment: current.segment,
      workspaceFilter: current.workspaceFilter,
      sessionFilter: current.sessionFilter,
    })
  }

  private patch(partial: Partial<AutomationSnapshot>): void {
    this.state.set({ ...this.buildSnapshot(), ...partial })
    this.armRefresh()
  }

  private publish(): void {
    this.state.set(this.buildSnapshot())
    this.armRefresh()
  }

  private buildSnapshot(): AutomationSnapshot {
    const current = this.state.get()
    const now = Date.now()
    const declared = this.getDeclaredCapabilities() ?? emptyCapabilities()
    const capabilities: HostCapabilities = {
      // Absent declared flag → probe via list success (RFC §6.4). Until probed, show the segment.
      schedule: declared.schedule === false
        ? false
        : (this.scheduleAvailable || !this.scheduleProbed || declared.schedule === true),
      jobs: declared.jobs === false ? false : true,
      workflow: declared.workflow === false ? false : true,
    }
    return {
      ...current,
      capabilities,
      schedules: this.filterSchedules(this.schedules.map(item => ({
        ...item,
        displayState: scheduleDisplayState(item, now),
      })), current.workspaceFilter, current.sessionFilter, current.focusSessionId),
      jobs: this.filterJobs(this.collectJobs(), current.workspaceFilter, current.sessionFilter),
      workflows: this.filterWorkflows(this.collectWorkflows(), current.workspaceFilter, current.sessionFilter),
    }
  }

  private collectJobs(): JobRow[] {
    const rows: JobRow[] = []
    for (const summary of this.sessions.listVisibleSummaries()) {
      const jobs = this.sessions.session(summary.sessionId).getSnapshot().jobs
      for (const job of jobs) rows.push({ ...job, sessionId: summary.sessionId })
    }
    return rows.sort((left, right) => right.startedAt - left.startedAt)
  }

  private collectWorkflows(): WorkflowRow[] {
    const live = new Set(this.liveWorkflows.map(item => `${item.sessionId}:${item.runId}`))
    const rows: WorkflowRow[] = []
    const seen = new Set<string>()
    for (const summary of this.sessions.listVisibleSummaries()) {
      for (const row of foldWorkflows(summary.sessionId, this.sessions.session(summary.sessionId).getSnapshot().events, live)) {
        rows.push(row)
        seen.add(`${row.sessionId}:${row.runId}`)
      }
    }
    // Live runs still held by the engine but not yet in the local event window.
    for (const item of this.liveWorkflows) {
      const key = `${item.sessionId}:${item.runId}`
      if (seen.has(key)) continue
      rows.push({
        sessionId: item.sessionId,
        runId: item.runId,
        name: item.name,
        status: 'running',
        live: true,
        agentsStarted: 0,
        agents: [],
      })
    }
    return rows
  }

  private filterSchedules(
    rows: readonly ScheduleRow[],
    workspaceFilter: WorkspaceId | 'all',
    sessionFilter: AutomationSessionFilter,
    focusSessionId: SessionId | undefined,
  ): ScheduleRow[] {
    return rows.filter(row => this.matchesSession(row.sessionId, workspaceFilter, sessionFilter, focusSessionId))
  }

  private filterJobs(
    rows: readonly JobRow[],
    workspaceFilter: WorkspaceId | 'all',
    sessionFilter: AutomationSessionFilter,
  ): JobRow[] {
    return rows.filter(row => this.matchesSession(row.sessionId, workspaceFilter, sessionFilter, undefined))
  }

  private filterWorkflows(
    rows: readonly WorkflowRow[],
    workspaceFilter: WorkspaceId | 'all',
    sessionFilter: AutomationSessionFilter,
  ): WorkflowRow[] {
    return rows.filter(row => this.matchesSession(row.sessionId, workspaceFilter, sessionFilter, undefined))
  }

  private matchesSession(
    sessionId: SessionId,
    workspaceFilter: WorkspaceId | 'all',
    sessionFilter: AutomationSessionFilter,
    focusSessionId: SessionId | undefined,
  ): boolean {
    if (focusSessionId !== undefined && sessionId !== focusSessionId) return false
    if (sessionFilter === 'active') return sessionId === this.sessions.getSnapshot().activeSessionId
    if (sessionFilter !== 'all') return sessionId === sessionFilter
    if (workspaceFilter === 'all') return true
    return this.sessions.workspaceIdOf(sessionId) === workspaceFilter
  }

  private armRefresh(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer)
    const next = nextScheduleRefreshAt(this.schedules, Date.now())
    if (next === undefined) {
      this.refreshTimer = undefined
      return
    }
    this.refreshTimer = setTimeout(() => this.publish(), Math.max(250, next - Date.now()))
  }
}
