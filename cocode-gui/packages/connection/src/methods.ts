/**
 * The unary methods Cocode calls, typed as one map. `HarnessTransport.call` reads
 * this map, so a call site never spells a method string or hand-types a payload.
 * Adding a harness method here is the whole cost of consuming it.
 */

import type {
  CommandDescriptor,
  CommandExecution,
  ContentBlock,
  DirectoryListing,
  FsListing,
  FsReadResult,
  GoalRef,
  HostDescription,
  MessageId,
  ModelSelection,
  PromptContentPart,
  QueueAction,
  SessionId,
  SessionModels,
  SessionSummary,
  WorkspaceId,
  WorkspaceView,
  HistoryEntry,
  SessionProjectionsBlock,
  ImageAttachmentRef,
  TerminalView,
  GitStatus,
  GitDiffFile,
  GitLogItem,
  SubagentCatalog,
  SettingsNamespaceView,
  SettingsPathOp,
  CredentialView,
  ConfigurableProviderView,
  DiscoveredModelView,
  ModelCatalogFailure,
  ModelProviderGroup,
  PluginInventoryEntry,
  ScheduleAtInput,
  ScheduleId,
  ScheduleListItem,
  JobView,
} from './wire.ts'

export interface RpcMethodMap {
  'host.describe': { payload: Record<string, never>; value: HostDescription }
  'host.pickDirectory': { payload: Record<string, never>; value: { path: string | null } }
  'host.listDirectory': { payload: { path?: string }; value: DirectoryListing }
  'host.createDirectory': { payload: { path: string; name: string }; value: { path: string } }
  'host.openPath': { payload: { path: string }; value: { opened: true } }

  'fs.list': { payload: { workspaceId: WorkspaceId; path?: string }; value: FsListing }
  'fs.read': {
    payload: { workspaceId: WorkspaceId; path: string; maxBytes?: number; includeBase64?: boolean }
    value: FsReadResult
  }
  'fs.write': {
    payload: { workspaceId: WorkspaceId; path: string; text: string; maxBytes?: number }
    value: { written: true; bytes: number }
  }
  'fs.create': {
    payload: { workspaceId: WorkspaceId; path: string; name: string; kind: 'file' | 'directory' }
    value: { path: string; kind: 'file' | 'directory' }
  }
  'fs.remove': { payload: { workspaceId: WorkspaceId; path: string }; value: { removed: true } }

  'terminal.create': {
    payload: { workspaceId: WorkspaceId; cols?: number; rows?: number }
    value: TerminalView
  }
  'terminal.write': { payload: { terminalId: string; data: string }; value: { written: true } }
  'terminal.resize': { payload: { terminalId: string; cols: number; rows: number }; value: { resized: true } }
  'terminal.close': { payload: { terminalId: string }; value: { closed: true } }
  'terminal.list': { payload: { workspaceId?: WorkspaceId }; value: { items: TerminalView[] } }

  'git.status': { payload: { workspaceId: WorkspaceId }; value: GitStatus }
  'git.diff': { payload: { workspaceId: WorkspaceId; path?: string }; value: { files: GitDiffFile[] } }
  'git.stage': { payload: { workspaceId: WorkspaceId; paths: string[] }; value: { staged: true } }
  'git.unstage': { payload: { workspaceId: WorkspaceId; paths: string[] }; value: { unstaged: true } }
  'git.discard': { payload: { workspaceId: WorkspaceId; paths: string[] }; value: { discarded: true } }
  'git.commit': { payload: { workspaceId: WorkspaceId; message: string }; value: { sha: string } }
  'git.log': {
    payload: { workspaceId: WorkspaceId; count?: number; skip?: number }
    value: { items: GitLogItem[] }
  }
  'git.show': {
    payload: { workspaceId: WorkspaceId; rev: string; path?: string }
    value: { files: GitDiffFile[] }
  }
  'git.branch': {
    payload: { workspaceId: WorkspaceId }
    value: { current: string; branches: string[] }
  }
  'git.checkout': {
    payload: { workspaceId: WorkspaceId; ref: string }
    value: { checkedOut: true; branch: string }
  }
  'git.revert': { payload: { workspaceId: WorkspaceId; sha: string }; value: { sha: string } }
  'git.cherryPick': { payload: { workspaceId: WorkspaceId; sha: string }; value: { sha: string } }

  'subagent.list': {
    payload: { parentSessionId: SessionId }
    value: SubagentCatalog
  }

  'workspace.list': { payload: Record<string, never>; value: { items: WorkspaceView[]; archivedSessionIds: SessionId[] } }
  'workspace.create': { payload: { path: string }; value: { workspace: WorkspaceView; created: boolean } }
  'workspace.rename': { payload: { workspaceId: WorkspaceId; title: string }; value: { workspace: WorkspaceView } }
  'workspace.delete': { payload: { workspaceId: WorkspaceId }; value: { deleted: true } }
  'workspace.insertBefore': { payload: { workspaceId: WorkspaceId; beforeWorkspaceId?: WorkspaceId }; value: { workspaceIds: WorkspaceId[] } }
  'workspace.insertSessionBefore': {
    payload: { workspaceId: WorkspaceId; sessionId: SessionId; beforeSessionId?: SessionId }
    value: { workspace: WorkspaceView }
  }
  'workspace.archiveSession': { payload: { sessionId: SessionId }; value: { archivedSessionIds: SessionId[] } }

  'session.list': { payload: { cursor?: string }; value: { items: SessionSummary[] } }
  'session.search': { payload: { query: string }; value: { items: { sessionId: SessionId; snippet: string }[]; hasMore: boolean } }
  'session.create': {
    payload: { workspaceId?: WorkspaceId; cwd?: string; sessionId?: SessionId; agentPreset?: string }
    value: { sessionId: SessionId; agentPreset?: string }
  }
  'session.history': {
    payload: { sessionId: SessionId; beforeSeq?: number; maxMessages?: number }
    value: { events: HistoryEntry[]; hasMore: boolean; projections?: SessionProjectionsBlock }
  }
  'session.models': { payload: { sessionId: SessionId }; value: SessionModels }
  'session.selectModel': {
    payload: { sessionId: SessionId; provider: string; model: string; reasoningEffort?: string }
    value: { selected: ModelSelection }
  }
  'session.rename': { payload: { sessionId: SessionId; title: string }; value: { title: string; seq: number } }
  'session.fork': { payload: { sessionId: SessionId; atSeq?: number }; value: { sessionId: SessionId } }
  'session.prompt': {
    payload: { sessionId: SessionId; mode: 'queue' | 'steer'; content: PromptContentPart[]; clientTimeZone?: string }
    value: { accepted: true; command?: { kind: 'success'; text?: string } }
  }
  'session.attachment': {
    payload: { sessionId: SessionId; attachmentId: string }
    value: { attachment: ImageAttachmentRef; data: string }
  }
  'session.updateQueue': { payload: { sessionId: SessionId; itemId: MessageId; action: QueueAction }; value: { accepted: true } }
  'session.cancel': { payload: { sessionId: SessionId }; value: { accepted: true } }

  'goal.create': { payload: { sessionId: SessionId; objective: string; maxGoalRounds?: number }; value: { ref: GoalRef } }
  'goal.edit': { payload: { sessionId: SessionId; ref: GoalRef; objective?: string; maxGoalRounds?: number }; value: { ref: GoalRef } }
  'goal.pause': { payload: { sessionId: SessionId; ref: GoalRef }; value: { ref: GoalRef } }
  'goal.resume': { payload: { sessionId: SessionId; ref: GoalRef }; value: { ref: GoalRef } }
  'goal.complete': { payload: { sessionId: SessionId; ref: GoalRef }; value: { ref: GoalRef } }
  'goal.clear': { payload: { sessionId: SessionId; ref: GoalRef }; value: { cleared: true } }

  /** Loopback-only (RFC §4.3): a remote caller is refused before dispatch. */
  'settings.describe': {
    payload: Record<string, never>
    value: { writable: boolean; hasDocument: boolean; namespaces: SettingsNamespaceView[] }
  }
  'settings.openDocument': { payload: Record<string, never>; value: { opened: true } }
  'settings.update': {
    payload: { ns: string; patch: Record<string, unknown>; expectedRevision?: number }
    value: SettingsNamespaceView
  }
  'settings.replace': {
    payload: { ns: string; section: Record<string, unknown>; expectedRevision?: number }
    value: SettingsNamespaceView
  }
  'settings.mutate': {
    payload: { ns: string; ops: SettingsPathOp[]; expectedRevision?: number }
    value: SettingsNamespaceView
  }

  'llm.providers': { payload: Record<string, never>; value: { providers: ConfigurableProviderView[] } }
  'llm.models': {
    payload: Record<string, never>
    value: { groups: ModelProviderGroup[]; failures: ModelCatalogFailure[] }
  }
  'llm.discoverModels': {
    payload: { settingsNs: string; provider?: string; baseURL?: string; api?: string; apiKey?: string }
    value: { models: DiscoveredModelView[] }
  }

  'credentials.describe': {
    payload: { refs: string[] }
    value: { credentials: Record<string, CredentialView> }
  }
  'credentials.set': { payload: { ref: string; value: string }; value: Record<string, never> }
  'credentials.unset': { payload: { ref: string }; value: Record<string, never> }

  'schedule.list': {
    payload: { sessionId?: SessionId }
    value: { items: ScheduleListItem[] }
  }
  'schedule.create': {
    payload: {
      sessionId: SessionId
      prompt: string
      afterSeconds?: number
      at?: ScheduleAtInput
      everySeconds?: number
    }
    value: { schedule: ScheduleListItem }
  }
  'schedule.delete': {
    payload: { sessionId: SessionId; id: ScheduleId }
    value: { deleted: true }
  }

  'job.kill': {
    payload: { sessionId: SessionId; jobId: string; reason?: string }
    value: { outcome: 'cancellation-requested' | 'already-finished'; job: JobView }
  }
  'job.output': {
    payload: { sessionId: SessionId; jobId: string; wait?: boolean; timeoutMs?: number }
    value: { text: string; job: JobView }
  }

  'workflow.cancel': {
    payload: { sessionId: SessionId; runId: string; reason?: string }
    value: { cancelled: true }
  }
}

/**
 * Typert Remote endpoints, the second upstream channel. They are namespaced
 * (`<ns>/<method>`) and their arguments ride a single `args` object; the domains
 * that own a generated contract publish here instead of adding an apiproxy method.
 */
export interface RemoteEndpointMap {
  'commands/list': { args: { agentId: SessionId }; value: CommandDescriptor[] }
  'commands/execute': { args: { agentId: SessionId; line: string }; value: CommandExecution | undefined }
  'pluginInventory/list': { args: Record<string, never>; value: { entries: PluginInventoryEntry[] } }
}

export type RemoteEndpoint = keyof RemoteEndpointMap
export type RemoteArgs<E extends RemoteEndpoint> = RemoteEndpointMap[E]['args']
export type RemoteValue<E extends RemoteEndpoint> = RemoteEndpointMap[E]['value']

export type RpcMethod = keyof RpcMethodMap
export type RequestPayload<M extends RpcMethod> = RpcMethodMap[M]['payload']
export type ResponseValue<M extends RpcMethod> = RpcMethodMap[M]['value']

/**
 * Methods paced by the user rather than by the machine. They opt out of the
 * default 30s deadline and rely on caller cancellation instead (RFC §4.3).
 */
export const USER_PACED_METHODS: ReadonlySet<RpcMethod> = new Set<RpcMethod>([
  'host.pickDirectory',
  'session.search',
  'llm.discoverModels',
])

/** Content blocks are re-exported so queue edits can be typed at the call site. */
export type { ContentBlock }
