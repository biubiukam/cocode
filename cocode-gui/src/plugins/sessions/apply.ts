import type { Context } from '@deepseek-ai/cordis'
import type { HostFrame } from '@cocode/gui-connection'
import { SessionStore } from '../../runtime/sessions/session-store.ts'

export const name = 'sessions'
export const inject = ['connection', 'nodes']

export function apply(ctx: Context) {
  const sessions = new SessionStore(ctx)

  sessions.route('host/session-added', ({ store, frame }) => {
    const added = frame as Extract<HostFrame, { type: 'host/session-added' }>
    store.addSessionSummary({
      sessionId: added.sessionId,
      updatedAt: Date.now(),
      running: false,
      blank: added.blank,
      ...(added.parentSessionId === undefined ? {} : { parentSessionId: added.parentSessionId }),
      ...(added.origin === undefined ? {} : { origin: added.origin }),
      ...(added.cwd === undefined ? {} : { cwd: added.cwd }),
      ...(added.agentPreset === undefined ? {} : { agentPreset: added.agentPreset }),
    })
  })
  sessions.route('host/session-removed', ({ store, frame }) => {
    store.removeSession((frame as Extract<HostFrame, { type: 'host/session-removed' }>).sessionId)
  })
  sessions.route('host/session-status', ({ store, frame }) => {
    const status = frame as Extract<HostFrame, { type: 'host/session-status' }>
    store.applySessionStatus(status.sessionId, status.running)
  })
  sessions.route('host/agent-error', ({ session, frame }) => {
    session?.setAgentError((frame as Extract<HostFrame, { type: 'host/agent-error' }>).message)
  })
  sessions.route('host/workspace-changed', ({ store, frame }) => {
    store.upsertWorkspace((frame as Extract<HostFrame, { type: 'host/workspace-changed' }>).workspace)
  })
  sessions.route('host/workspace-removed', ({ store, frame }) => {
    store.removeWorkspace((frame as Extract<HostFrame, { type: 'host/workspace-removed' }>).workspaceId)
  })
  sessions.route('host/workspace-order-changed', ({ store, frame }) => {
    store.reorderWorkspaces((frame as Extract<HostFrame, { type: 'host/workspace-order-changed' }>).workspaceIds)
  })
  sessions.route('host/archived-sessions-changed', ({ store, frame }) => {
    store.setArchived((frame as Extract<HostFrame, { type: 'host/archived-sessions-changed' }>).archivedSessionIds)
  })
  sessions.route('stream/error', ({ session, store, frame }) => {
    const message = (frame as { error: { message: string } }).error.message
    if (session !== undefined) session.setAgentError(message)
    else store.setStoreError(message)
  })

  ctx.on('connection/ready', () => {
    void sessions.refreshBaselines()
  })
  ctx.on('connection/lost', () => {
    sessions.dropGenerationState()
  })
}
