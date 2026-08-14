/**
 * One live session: the authoritative client-side view of a harness session and
 * the operations that mutate it.
 *
 * Every piece of state here can be replaced wholesale, not just appended to. The
 * protocol offers no gap-filling resume, so a reconnect re-takes the baseline and
 * this object must converge on it (RFC §4.3).
 */

import type {
  GoalProjection,
  HarnessTransport,
  JobView,
  PromptContentPart,
  QueuedInboxItem,
  RpcError,
  SessionEvent,
  SessionModels,
  SessionSummary,
  AskUserQuestionItem,
  HistoryEntry,
  TodoItem,
  ToolEventView,
} from '@cocode/gui-connection'
import type { NodeRegistry } from '../nodes/registry.ts'
import { ConversationNodeAssembler } from '../nodes/assembler.ts'
import { Notifier, type Publication } from '../notifier.ts'
import type { ConversationNode, PendingToolApproval } from './conversation.ts'

/** How many raw events the Trajectory panel can look back over. */
const EVENT_WINDOW_LIMIT = 4000
/** History page size; the harness cuts pages at message boundaries. */
const HISTORY_PAGE_MESSAGES = 60

export type PendingQuestion = {
  rpcId: string
  questions: AskUserQuestionItem[]
}

export type QuestionAnswer = { id: string; selected: string[]; custom?: string }

export type SessionSnapshot = {
  sessionId: string
  title: string | undefined
  running: boolean
  blank: boolean
  cwd: string | undefined
  agentPreset: string | undefined
  updatedAt: number
  nodes: readonly ConversationNode[]
  events: readonly SessionEvent[]
  todos: readonly TodoItem[]
  queue: readonly QueuedInboxItem[]
  jobs: readonly JobView[]
  goal: GoalProjection | null
  question: PendingQuestion | undefined
  models: SessionModels | undefined
  historyLoading: boolean
  historyLoaded: boolean
  hasMoreHistory: boolean
  /** Live failure text with no turn position (`host/agent-error`, refused prompts). */
  error: string | undefined
}

export class Session {
  readonly sessionId: string

  private readonly notifier = new Notifier()
  private readonly fold: ConversationNodeAssembler
  private readonly projections = new Map<string, { value: unknown; seq: number }>()
  /** approvalId → the frame's rpcId and the call it blocks. */
  private readonly approvals = new Map<string, { rpcId: string; callId?: string; toolName: string; reason?: string }>()

  private events: SessionEvent[] = []
  private summary: SessionSummary
  private queue: readonly QueuedInboxItem[] = []
  private jobs: readonly JobView[] = []
  private question: PendingQuestion | undefined
  private models: SessionModels | undefined
  private historyLoading = false
  private historyLoaded = false
  private hasMoreHistory = false
  private error: string | undefined
  private oldestSeq: number | undefined

  /**
   * The subscription baseline from `session/subscribed`: the last seq the host
   * had committed when this generation's stream attached. It is what makes a
   * missing tail detectable, since a history page fetched before that point
   * would silently look complete.
   */
  private subscribedLastSeq: number | undefined

  /**
   * Live frames that arrived while a history page was in flight. The page
   * replaces the window wholesale, so anything appended during the load would be
   * thrown away; these are stitched back in seq order once the page lands.
   */
  private liveBuffer: HistoryEntry[] = []
  /** True while the window is being replaced, so live frames must buffer. */
  private windowLoading = false

  private snapshotCache: SessionSnapshot | undefined

  constructor(
    summary: SessionSummary,
    private readonly getTransport: () => HarnessTransport | undefined,
    nodes: NodeRegistry,
  ) {
    this.sessionId = summary.sessionId
    this.summary = summary
    this.fold = new ConversationNodeAssembler(nodes)
    this.seedProjections(summary)
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener)
  }

  getSnapshot(): SessionSnapshot {
    this.snapshotCache ??= {
      sessionId: this.sessionId,
      title: this.readTitle(),
      running: this.summary.running,
      blank: this.summary.blank,
      cwd: this.summary.cwd,
      agentPreset: this.summary.agentPreset,
      updatedAt: this.summary.updatedAt,
      nodes: this.decorateNodes(this.fold.snapshot()),
      events: this.events,
      todos: this.fold.currentTodos,
      queue: this.queue,
      jobs: this.jobs,
      goal: this.readGoal(),
      question: this.question,
      models: this.models,
      historyLoading: this.historyLoading,
      historyLoaded: this.historyLoaded,
      hasMoreHistory: this.hasMoreHistory,
      error: this.error,
    }
    return this.snapshotCache
  }

  /**
   * Invalidates the cached snapshot and publishes at the given urgency.
   * Defaults to `immediate`; only visible streaming progress uses `frame`.
   */
  private changed(publication: Publication = 'immediate'): void {
    if (publication === 'none') return
    this.snapshotCache = undefined
    this.notifier.publish(publication)
  }

  /** Applies a fresh list summary; `session.list` is the authoritative baseline. */
  applySummary(summary: SessionSummary): void {
    this.summary = summary
    this.seedProjections(summary)
    this.changed()
  }

  setRunning(running: boolean): void {
    if (this.summary.running === running) return
    // A session that has run is no longer blank, whatever the stale summary says.
    this.summary = { ...this.summary, running, blank: running ? false : this.summary.blank }
    this.changed()
  }

  setAgentError(message: string): void {
    this.error = message
    this.changed()
  }

  clearError(): void {
    if (this.error === undefined) return
    this.error = undefined
    this.changed()
  }

  /**
   * Drops every generation-scoped fact. Called when a connection generation dies:
   * pending decisions belong to a socket that no longer exists, and the next
   * generation replays whatever is still outstanding.
   */
  dropGenerationState(): void {
    if (this.approvals.size === 0 && this.question === undefined) return
    this.approvals.clear()
    this.question = undefined
    this.changed()
  }

  receiveEvent(event: SessionEvent, view: ToolEventView | undefined): void {
    this.appendEvent(event, view)
  }

  receiveSubscribed(lastSeq: number): void {
    this.applySubscribed(lastSeq)
  }

  receiveQueue(items: readonly QueuedInboxItem[]): void {
    this.queue = items
    this.changed()
  }

  receiveJobs(jobs: readonly JobView[]): void {
    this.jobs = jobs
    this.changed()
  }

  receiveProjection(key: string, value: unknown, seq: number): void {
    this.applyProjection(key, value, seq)
  }

  receiveApprovalRequested(rpcId: string, frame: {
    approvalId: string
    callId?: string
    toolName: string
    reason?: string
  }): void {
    this.approvals.set(frame.approvalId, {
      rpcId,
      callId: frame.callId,
      toolName: frame.toolName,
      reason: frame.reason,
    })
    this.changed()
  }

  receiveApprovalResolved(approvalId: string): void {
    this.approvals.delete(approvalId)
    this.changed()
  }

  receiveQuestionRequested(rpcId: string, questions: AskUserQuestionItem[]): void {
    this.question = { rpcId, questions }
    this.changed()
  }

  receiveQuestionResolved(questionRpcId: string): void {
    if (this.question?.rpcId === questionRpcId) this.question = undefined
    this.changed()
  }

  private decorateNodes(nodes: readonly ConversationNode[]): readonly ConversationNode[] {
    return nodes.map(node => {
      if (node.kind !== 'tool') return node
      const approval = this.approvalFor(node.callId)
      if (approval === undefined) {
        if (node.approval === undefined && node.status !== 'awaiting-approval') return node
        return { ...node, approval: undefined, status: node.status === 'awaiting-approval' ? 'running' : node.status }
      }
      return { ...node, approval, status: 'awaiting-approval' }
    })
  }

  /**
   * Handles the subscription baseline that opens every generation's stream.
   *
   * Three pieces of state are only correct relative to a generation, and the
   * baseline is where they reset. Projections rewind because a restarted host
   * recomputes them from a lower seq and a stale higher-seq row would win
   * forever. Queue and jobs are whole-snapshot pushes with no "empty" baseline,
   * so a set that emptied while disconnected has to be cleared here or it
   * lingers as a phantom.
   */
  private applySubscribed(lastSeq: number): void {
    this.subscribedLastSeq = lastSeq
    for (const [key, entry] of [...this.projections]) {
      if (entry.seq > lastSeq) this.projections.delete(key)
    }
    this.queue = []
    this.jobs = []
    this.changed()
    // A window fetched before the stream attached can be short of the baseline.
    if (this.historyLoaded) void this.repairTail()
  }

  private tailSeq(): number | undefined {
    return this.events.at(-1)?.seq
  }

  private appendEvent(event: SessionEvent, view: ToolEventView | undefined): void {
    // The window is about to be replaced; hold the frame and stitch it after.
    if (this.windowLoading) {
      this.liveBuffer.push({ event, view })
      return
    }

    const tail = this.tailSeq()
    // Replay overlap between a history page and the live stream.
    if (tail !== undefined && event.seq <= tail) return

    // A gap means events were committed that this window never saw. Appending
    // across it would leave a permanent hole that no later frame repairs, so the
    // frame waits and the tail is refetched instead.
    if (tail !== undefined && event.seq > tail + 1) {
      this.liveBuffer.push({ event, view })
      void this.repairTail()
      return
    }

    this.commitEvent({ event, view })
  }

  /** Appends one entry to the window and folds it, reporting the fold's urgency. */
  private commitEvent(entry: HistoryEntry): void {
    this.events = [...this.events, entry.event].slice(-EVENT_WINDOW_LIMIT)
    this.oldestSeq ??= entry.event.seq
    this.changed(this.fold.ingest(entry))
  }

  private applyProjection(key: string, value: unknown, seq: number): void {
    const existing = this.projections.get(key)
    // Higher-seq-wins: a list baseline can never overwrite a newer push frame.
    if (existing !== undefined && existing.seq > seq) return
    this.projections.set(key, { value, seq })
    this.changed()
  }

  private seedProjections(summary: SessionSummary): void {
    const block = summary.projections
    if (block === undefined) return
    for (const [key, value] of Object.entries(block.values)) {
      this.applyProjection(key, value, block.asOfSeq)
    }
  }

  private readTitle(): string | undefined {
    const raw = this.projections.get('title')?.value
    return typeof raw === 'string' && raw !== '' ? raw : undefined
  }

  /** The `goal` projection is a durable JSON boundary, so its shape is verified. */
  private readGoal(): GoalProjection | null {
    const raw = this.projections.get('goal')?.value
    if (raw === null || raw === undefined || typeof raw !== 'object') return null
    const candidate = raw as Partial<GoalProjection>
    const goal = candidate.goal
    if (goal === undefined || typeof goal.objective !== 'string' || typeof goal.phase !== 'string') return null
    return candidate as GoalProjection
  }

  // ---- Operations ----

  /**
   * Loads the tail page. Always replaces the window rather than merging: the tail
   * page is the baseline, and merging a stale window into it is exactly how a
   * client starts showing state that no longer exists.
   */
  async loadHistory(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined || this.historyLoading) return
    this.historyLoading = true
    this.windowLoading = true
    this.changed()

    const result = await transport.call('session.history', {
      sessionId: this.sessionId,
      maxMessages: HISTORY_PAGE_MESSAGES,
    })
    this.historyLoading = false
    if (!result.ok) {
      this.windowLoading = false
      this.error = result.error.message
      this.changed()
      return
    }

    this.installWindow(result.value.events, result.value.hasMore, result.value.projections)

    // The page may predate the stream's baseline; one more tail closes the gap.
    const tail = this.tailSeq()
    if (this.subscribedLastSeq !== undefined && (tail === undefined || this.subscribedLastSeq > tail)) {
      await this.repairTail()
    }
  }

  /**
   * Replaces the window with a freshly fetched page, then replays whatever live
   * frames arrived while it was in flight. Replacement is the only safe merge:
   * the page is authoritative and the buffer is strictly newer.
   */
  private installWindow(
    entries: readonly HistoryEntry[],
    hasMore: boolean,
    projections: { asOfSeq: number; values: Record<string, unknown> } | undefined,
  ): void {
    this.fold.replaceWindow(entries)
    this.events = entries.map(entry => entry.event)
    this.oldestSeq = entries[0]?.event.seq
    this.hasMoreHistory = hasMore
    this.historyLoaded = true

    if (projections !== undefined) {
      for (const [key, value] of Object.entries(projections.values)) {
        this.applyProjection(key, value, projections.asOfSeq)
      }
    }

    const buffered = this.liveBuffer
    this.liveBuffer = []
    this.windowLoading = false
    // Ordered replay: the buffer is stream-ordered, and commitEvent's own
    // dedup drops anything the page already carried.
    for (const entry of [...buffered].sort((left, right) => left.event.seq - right.event.seq)) {
      const tail = this.tailSeq()
      if (tail !== undefined && entry.event.seq <= tail) continue
      this.commitEvent(entry)
    }
    this.changed()
  }

  /**
   * Refetches the tail page after a detected gap.
   *
   * The protocol has no seq-based resume, so a gap is closed by re-taking the
   * baseline rather than by asking for the missing range.
   */
  private async repairTail(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined || this.windowLoading) return
    this.windowLoading = true

    const result = await transport.call('session.history', {
      sessionId: this.sessionId,
      maxMessages: HISTORY_PAGE_MESSAGES,
    })
    if (!result.ok) {
      this.windowLoading = false
      this.error = result.error.message
      this.changed()
      return
    }
    this.installWindow(result.value.events, result.value.hasMore, result.value.projections)
  }

  /**
   * Rebuilds everything this session knows, for a new connection generation.
   *
   * The window, the subscription baseline, and every pending decision belong to
   * the generation that just died. The host replays still-outstanding approvals
   * and questions on the new stream with their original rpcIds, so discarding
   * them here loses nothing and keeps the interface from offering a decision
   * that can no longer be delivered.
   */
  async resync(): Promise<void> {
    this.dropGenerationState()
    this.subscribedLastSeq = undefined
    this.liveBuffer = []
    this.windowLoading = false
    this.historyLoading = false
    if (!this.historyLoaded) return
    await this.loadHistory()
  }

  /** Prepends the previous page. This is the only path that does not re-baseline. */
  async loadOlderHistory(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined || this.historyLoading || this.windowLoading || !this.hasMoreHistory) return
    const beforeSeq = this.oldestSeq
    if (beforeSeq === undefined) return
    this.historyLoading = true
    this.windowLoading = true
    this.changed()

    const result = await transport.call('session.history', {
      sessionId: this.sessionId,
      beforeSeq,
      maxMessages: HISTORY_PAGE_MESSAGES,
    })
    this.historyLoading = false
    if (!result.ok) {
      this.windowLoading = false
      this.error = result.error.message
      this.changed()
      return
    }

    // The fold is strictly forward-only, so growing the window backwards means
    // re-folding the combined window from its new start. `hasMore` describes the
    // older edge and comes from this page; the tail is unchanged.
    const merged = [...result.value.events, ...this.events.map(event => ({ event }))]
    this.installWindow(merged, result.value.hasMore, undefined)
  }

  /**
   * Sends a prompt.
   * @param content - text and image parts the composer assembled.
   * @param mode - `queue` appends to the inbox, `steer` interrupts the running turn.
   * @returns the wire error when the host refused, otherwise `undefined`.
   */
  async prompt(content: PromptContentPart[], mode: 'queue' | 'steer'): Promise<RpcError | undefined> {
    const transport = this.getTransport()
    if (transport === undefined) {
      return { code: 'internal', message: '尚未连接到 harness。', details: {} }
    }
    this.clearError()
    const result = await transport.call('session.prompt', {
      sessionId: this.sessionId,
      mode,
      content,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    if (result.ok) return undefined
    this.error = result.error.message
    this.changed()
    return result.error
  }

  async cancel(): Promise<void> {
    await this.getTransport()?.call('session.cancel', { sessionId: this.sessionId })
  }

  async rename(title: string): Promise<void> {
    const result = await this.getTransport()?.call('session.rename', { sessionId: this.sessionId, title })
    if (result?.ok !== true) return
    this.applyProjection('title', result.value.title, result.value.seq)
  }

  async removeQueueItem(itemId: string): Promise<void> {
    await this.getTransport()?.call('session.updateQueue', { sessionId: this.sessionId, itemId, action: { kind: 'remove' } })
  }

  async steerQueueItem(itemId: string): Promise<void> {
    await this.getTransport()?.call('session.updateQueue', { sessionId: this.sessionId, itemId, action: { kind: 'steer' } })
  }

  /** Loads the advisory model directory on demand; the picker opens against it. */
  async loadModels(): Promise<void> {
    const result = await this.getTransport()?.call('session.models', { sessionId: this.sessionId })
    if (result?.ok !== true) return
    this.models = result.value
    this.changed()
  }

  async selectModel(provider: string, model: string, reasoningEffort?: string): Promise<void> {
    const result = await this.getTransport()?.call('session.selectModel', {
      sessionId: this.sessionId,
      provider,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    })
    if (result?.ok !== true || this.models === undefined) return
    this.models = { ...this.models, current: result.value.selected }
    this.changed()
  }

  /**
   * Answers a tool approval. The rpcId echoes the requesting frame — the harness
   * routes the answer by it, so minting a new one would orphan the request.
   */
  async resolveApproval(approvalId: string, outcome: 'allowed-once' | 'rejected'): Promise<void> {
    const approval = this.approvals.get(approvalId)
    const transport = this.getTransport()
    if (approval === undefined || transport === undefined) return
    await transport.respond(approval.rpcId, {
      ok: true,
      value: { sessionId: this.sessionId, approvalId, outcome },
    })
  }

  /** Answers an ask-user question. */
  async answerQuestion(answers: QuestionAnswer[]): Promise<void> {
    const pending = this.question
    const transport = this.getTransport()
    if (pending === undefined || transport === undefined) return
    await transport.respond(pending.rpcId, {
      ok: true,
      value: { sessionId: this.sessionId, answer: { answers } },
    })
  }

  /** Declines an ask-user question; the harness treats the cancelled branch as "no answer". */
  async cancelQuestion(): Promise<void> {
    const pending = this.question
    const transport = this.getTransport()
    if (pending === undefined || transport === undefined) return
    await transport.respond(pending.rpcId, {
      ok: false,
      error: { code: 'cancelled', message: '用户取消了提问。', details: {} },
    })
  }

  /** Finds the pending approval bound to a tool call, for the inline approval card. */
  approvalFor(callId: string): PendingToolApproval | undefined {
    for (const [approvalId, approval] of this.approvals) {
      if (approval.callId !== callId) continue
      return { approvalId, rpcId: approval.rpcId, toolName: approval.toolName, reason: approval.reason }
    }
    return undefined
  }
}
