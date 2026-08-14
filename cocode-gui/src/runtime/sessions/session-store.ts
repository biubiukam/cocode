/**
 * The workspace and session directory, and the router for both downlink streams.
 *
 * Every collection here supports idempotent whole replacement, because that is
 * how the protocol recovers: `workspace.list` and `session.list` are the
 * authoritative baselines and a reconnect re-takes them (RFC §4.3).
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  HarnessTransport,
  HostFrame,
  MuxFrame,
  SessionId,
  SessionSummary,
  WorkspaceId,
  WorkspaceView,
} from '@cocode/gui-connection'
import { Notifier } from '../notifier.ts'
import { Session } from './session.ts'

export type FrameHandler = (input: {
  session: Session | undefined
  store: SessionStore
  rpcId: string
  frame: MuxFrame | HostFrame
}) => void

export type WorkspaceGroup = {
  workspace: WorkspaceView
  sessions: readonly SessionSummary[]
}

export type SessionStoreSnapshot = {
  groups: readonly WorkspaceGroup[]
  /** Sessions attached to no workspace; shown under an "未归类" group. */
  loose: readonly SessionSummary[]
  archivedSessionIds: ReadonlySet<SessionId>
  activeSessionId: SessionId | undefined
  activeWorkspaceId: WorkspaceId | undefined
  loading: boolean
  error: string | undefined
}

export class SessionStore extends Service {
  private readonly notifier = new Notifier()
  private readonly sessions = new Map<SessionId, Session>()
  private summaries = new Map<SessionId, SessionSummary>()
  private workspaces: WorkspaceView[] = []
  private archived: ReadonlySet<SessionId> = new Set()
  private activeSessionId: SessionId | undefined
  private loading = false
  private error: string | undefined
  private snapshotCache: SessionStoreSnapshot | undefined
  private readonly muxRoutes = new Map<string, Set<FrameHandler>>()
  private readonly hostRoutes = new Map<string, Set<FrameHandler>>()
  private watchFiberDispose: (() => void) | undefined
  private _scopeId: SessionId | undefined

  constructor(ctx: Context) {
    super(ctx, 'sessions')
  }

  private getTransport(): HarnessTransport | undefined {
    return this.ctx.root.get('connection')?.activeTransport
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener)
  }

  getSnapshot(): SessionStoreSnapshot {
    this.snapshotCache ??= this.buildSnapshot()
    return this.snapshotCache
  }

  /**
   * Registers a mux or host frame handler. Caller-fiber effect.
   * @param type - frame `type` string.
   * @param handler - receives the addressed session when the frame has one.
   */
  route(type: string, handler: FrameHandler): () => void {
    return this.ctx.effect(() => {
      const tables: Map<string, Set<FrameHandler>>[] = type.startsWith('host/')
        ? [this.hostRoutes]
        : [this.muxRoutes]
      if (type === 'stream/error') tables.push(this.hostRoutes, this.muxRoutes)
      const unique = [...new Set(tables)]
      for (const table of unique) {
        const bucket = table.get(type) ?? new Set()
        bucket.add(handler)
        table.set(type, bucket)
      }
      return () => {
        for (const table of unique) table.get(type)?.delete(handler)
      }
    }, `sessions.route(${type})`)
  }

  /**
   * Returns a handle bound to one session. Scoped methods throw on the root service.
   * @param id - session to bind.
   */
  scope(id: SessionId): SessionStore {
    const scoped = Object.create(this) as SessionStore
    scoped._scopeId = id
    return scoped
  }

  /** The session bound to this scope. Throws when called on the root service. */
  get current(): Session {
    if (this._scopeId === undefined) {
      throw new Error('scoped session method called on root context')
    }
    return this.session(this._scopeId)
  }

  dispatchMux(rpcId: string, frame: MuxFrame): void {
    const handlers = this.muxRoutes.get(frame.type)
    if (handlers === undefined || handlers.size === 0) return
    const sessionId = 'sessionId' in frame ? frame.sessionId : undefined
    const session = sessionId === undefined ? undefined : this.session(sessionId)
    for (const handler of handlers) handler({ session, store: this, rpcId, frame })
  }

  dispatchHost(rpcId: string, frame: HostFrame): void {
    const handlers = this.hostRoutes.get(frame.type)
    if (handlers === undefined || handlers.size === 0) return
    const sessionId = 'sessionId' in frame ? frame.sessionId : undefined
    const session = sessionId === undefined ? undefined : this.session(sessionId)
    for (const handler of handlers) handler({ session, store: this, rpcId, frame })
  }

  /** The live object for a session, created on first observation. */
  session(sessionId: SessionId): Session {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const nodes = this.ctx.root.get('nodes')
    if (nodes === undefined) throw new Error('sessions.session before the nodes service mounted')
    const summary = this.summaries.get(sessionId)
      ?? { sessionId, updatedAt: Date.now(), running: false, blank: true }
    const created = new Session(summary, () => this.getTransport(), nodes)
    this.sessions.set(sessionId, created)
    return created
  }

  activeSession(): Session | undefined {
    return this.activeSessionId === undefined ? undefined : this.session(this.activeSessionId)
  }

  /** Selects a session, mints its scope fiber, and loads its history baseline. */
  setActiveSession(sessionId: SessionId | undefined): void {
    if (this.activeSessionId === sessionId) return
    this.activeSessionId = sessionId
    this.mintWatchFiber(sessionId)
    this.changed()
    if (sessionId === undefined) return
    void this.session(sessionId).loadHistory()
  }

  /** Refetches every baseline. Runs on each newly ready generation. */
  async refreshBaselines(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    this.loading = true
    this.changed()

    const [workspaces, sessions] = await Promise.all([
      transport.call('workspace.list', {}),
      transport.call('session.list', {}),
    ])
    this.loading = false

    if (workspaces.ok) {
      this.workspaces = workspaces.value.items
      this.archived = new Set(workspaces.value.archivedSessionIds)
    }
    if (sessions.ok) {
      this.summaries = new Map(sessions.value.items.map(item => [item.sessionId, item]))
      for (const [sessionId, session] of this.sessions) {
        const summary = this.summaries.get(sessionId)
        if (summary !== undefined) session.applySummary(summary)
      }
    }
    this.error = workspaces.ok && sessions.ok ? undefined : (workspaces.ok ? '' : workspaces.error.message) || (sessions.ok ? '' : sessions.error.message)

    // Selecting nothing on a populated host leaves the shell staring at an empty
    // conversation; pick the most recent real session instead.
    if (this.activeSessionId === undefined || !this.summaries.has(this.activeSessionId)) {
      this.activeSessionId = this.defaultSession()
    }
    this.changed()

    // Every session that already has a window rebuilds it: a session the user is
    // not looking at right now is still one tab switch away, and a stale window
    // is worse than a loading one.
    for (const [, session] of this.sessions) void session.resync()
    if (this.activeSessionId !== undefined) void this.session(this.activeSessionId).loadHistory()
  }

  /** Drops per-generation state from every live session. */
  dropGenerationState(): void {
    for (const [, session] of this.sessions) session.dropGenerationState()
  }

  addSessionSummary(summary: SessionSummary): void {
    this.summaries.set(summary.sessionId, summary)
    this.sessions.get(summary.sessionId)?.applySummary(summary)
    this.changed()
  }

  removeSession(sessionId: SessionId): void {
    this.summaries.delete(sessionId)
    this.sessions.delete(sessionId)
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.defaultSession()
      this.mintWatchFiber(this.activeSessionId)
    }
    this.changed()
  }

  applySessionStatus(sessionId: SessionId, running: boolean): void {
    const summary = this.summaries.get(sessionId)
    if (summary !== undefined) {
      this.summaries.set(sessionId, {
        ...summary,
        running,
        blank: running ? false : summary.blank,
        updatedAt: running ? Date.now() : summary.updatedAt,
      })
    }
    this.sessions.get(sessionId)?.setRunning(running)
    this.changed()
  }

  upsertWorkspace(workspace: WorkspaceView): void {
    const index = this.workspaces.findIndex(item => item.workspaceId === workspace.workspaceId)
    this.workspaces = index === -1
      ? [...this.workspaces, workspace]
      : this.workspaces.map(item => (item.workspaceId === workspace.workspaceId ? workspace : item))
    this.changed()
  }

  removeWorkspace(workspaceId: WorkspaceId): void {
    this.workspaces = this.workspaces.filter(item => item.workspaceId !== workspaceId)
    this.changed()
  }

  reorderWorkspaces(workspaceIds: readonly WorkspaceId[]): void {
    const byId = new Map(this.workspaces.map(item => [item.workspaceId, item]))
    this.workspaces = workspaceIds
      .map(id => byId.get(id))
      .filter((item): item is WorkspaceView => item !== undefined)
    this.changed()
  }

  setArchived(sessionIds: readonly SessionId[]): void {
    this.archived = new Set(sessionIds)
    this.changed()
  }

  setStoreError(message: string): void {
    this.error = message
    this.changed()
  }

  private mintWatchFiber(sessionId: SessionId | undefined): void {
    this.watchFiberDispose?.()
    this.watchFiberDispose = undefined
    if (sessionId === undefined) return
    const fiber = this.ctx.plugin((scopeCtx) => {
      scopeCtx.effect(() => () => {
        this.ctx.get('slots')?.pruneStoreScope(sessionId)
      }, `sessions.scope(${sessionId})`)
    })
    this.watchFiberDispose = () => { void fiber.dispose() }
  }

  // ---- Operations ----

  /**
   * Creates a session in a workspace and selects it. A blank session in the same
   * workspace is reused rather than piling up empty rows, which is what the
   * `blank` bit exists for.
   */
  async createSession(workspaceId: WorkspaceId | undefined): Promise<SessionId | undefined> {
    const transport = this.getTransport()
    if (transport === undefined) return undefined

    const reusable = this.sessionsOf(workspaceId).find(summary => summary.blank && !summary.running)
    if (reusable !== undefined) {
      this.setActiveSession(reusable.sessionId)
      return reusable.sessionId
    }

    const result = await transport.call('session.create', workspaceId === undefined ? {} : { workspaceId })
    if (!result.ok) {
      this.error = result.error.message
      this.changed()
      return undefined
    }
    this.setActiveSession(result.value.sessionId)
    return result.value.sessionId
  }

  /** Registers a directory as a workspace. */
  async createWorkspace(path: string): Promise<WorkspaceView | undefined> {
    const result = await this.getTransport()?.call('workspace.create', { path })
    if (result?.ok !== true) {
      if (result !== undefined) {
        this.error = result.error.message
        this.changed()
      }
      return undefined
    }
    return result.value.workspace
  }

  async renameWorkspace(workspaceId: WorkspaceId, title: string): Promise<void> {
    await this.getTransport()?.call('workspace.rename', { workspaceId, title })
  }

  async deleteWorkspace(workspaceId: WorkspaceId): Promise<void> {
    await this.getTransport()?.call('workspace.delete', { workspaceId })
  }

  async archiveSession(sessionId: SessionId): Promise<void> {
    await this.getTransport()?.call('workspace.archiveSession', { sessionId })
  }

  /** Content search across sessions; the command palette calls it. */
  async searchSessions(query: string, signal?: AbortSignal): Promise<{ sessionId: SessionId; snippet: string }[]> {
    const result = await this.getTransport()?.call('session.search', { query }, signal === undefined ? {} : { signal })
    return result?.ok === true ? result.value.items : []
  }

  /** Visible (non-archived, non-subagent) session summaries. */
  listVisibleSummaries(): readonly SessionSummary[] {
    const snapshot = this.getSnapshot()
    return [...snapshot.groups.flatMap(group => group.sessions), ...snapshot.loose]
  }

  /** Workspace that currently claims this session, if any. */
  workspaceIdOf(sessionId: SessionId): WorkspaceId | undefined {
    return this.workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
  }

  /** The workspace owning the active session, used to scope layout persistence. */
  activeWorkspaceId(): WorkspaceId | undefined {
    const sessionId = this.activeSessionId
    if (sessionId === undefined) return this.workspaces[0]?.workspaceId
    return this.workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
  }

  private sessionsOf(workspaceId: WorkspaceId | undefined): SessionSummary[] {
    if (workspaceId === undefined) return [...this.summaries.values()]
    const workspace = this.workspaces.find(item => item.workspaceId === workspaceId)
    if (workspace === undefined) return []
    return workspace.sessionIds
      .map(id => this.summaries.get(id))
      .filter((summary): summary is SessionSummary => summary !== undefined)
  }

  private defaultSession(): SessionId | undefined {
    const visible = [...this.summaries.values()]
      .filter(summary => !this.archived.has(summary.sessionId) && summary.origin !== 'subagent')
      .sort((left, right) => right.updatedAt - left.updatedAt)
    return visible[0]?.sessionId
  }

  private changed(): void {
    this.snapshotCache = undefined
    this.notifier.markDirty()
  }

  private buildSnapshot(): SessionStoreSnapshot {
    const claimed = new Set<SessionId>()
    const groups = this.workspaces.map(workspace => {
      const sessions = workspace.sessionIds
        .map(id => {
          claimed.add(id)
          return this.summaries.get(id)
        })
        .filter((summary): summary is SessionSummary => summary !== undefined)
        .filter(summary => !this.archived.has(summary.sessionId) && summary.origin !== 'subagent')
      return { workspace, sessions }
    })
    const loose = [...this.summaries.values()]
      .filter(summary => !claimed.has(summary.sessionId))
      .filter(summary => !this.archived.has(summary.sessionId) && summary.origin !== 'subagent')
      .sort((left, right) => right.updatedAt - left.updatedAt)

    return {
      groups,
      loose,
      archivedSessionIds: this.archived,
      activeSessionId: this.activeSessionId,
      activeWorkspaceId: this.activeWorkspaceId(),
      loading: this.loading,
      error: this.error === '' ? undefined : this.error,
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }
}
