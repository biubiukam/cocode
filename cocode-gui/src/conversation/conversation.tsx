/**
 * The middle column: header, thread, input dock, Composer.
 *
 * This is the only component that owns a whole session's interaction surface, so
 * it is where the session object's operations are wired to user gestures.
 */

import { useEffect, useRef } from 'react'
import { AlertCircle, MessageSquare, Plus } from 'lucide-react'
import { Button, EmptyState } from '@cocode/ui'
import { focusZoneAttribute } from '../runtime/index.ts'
import {
  useActiveSession, useCommandCatalog, useCommands, useConnectionService, useLayout, useLayoutActions,
  useSessionDirectory, useSessionSnapshot, useSessions,
} from '../shell/runtime-context.tsx'
import { SessionHeader } from './session-header.tsx'
import { MessageThread } from './message-thread.tsx'
import { InputDock } from './input-dock.tsx'
import { Composer, type ComposerHandle } from './composer.tsx'

export function Conversation() {
  const sessions = useSessions()
  const commands = useCommands()
  const connection = useConnectionService()
  const directory = useSessionDirectory()
  const session = useActiveSession()
  const snapshot = useSessionSnapshot(session)
  const actions = useLayoutActions()
  const sidebar = useLayout(layout => layout.sidebar)
  const sidebarDrawerOpen = useLayout(layout => layout.sidebarDrawerOpen)
  const sidebarDrawer = useLayout(layout => layout.sidebarDrawer)
  const rightSize = useLayout(layout => layout.right.size)
  const bottomSize = useLayout(layout => layout.bottom.size)
  const catalog = useCommandCatalog(directory.activeSessionId)
  const composerRef = useRef<ComposerHandle>(null)

  // Switching tasks discards per-session panel instances; the tab slots of
  // session-scoped singletons stay and rebuild against the new session (§5.3).
  useEffect(() => {
    actions.pruneSessionScopedTabs()
  }, [directory.activeSessionId, actions])

  const sidebarOpen = sidebarDrawer ? sidebarDrawerOpen : sidebar > 0
  const showSidebarToggleInCenter = sidebarDrawer ? !sidebarDrawerOpen : sidebar === 0

  if (session === undefined || snapshot === undefined) {
    return (
      <section {...focusZoneAttribute('conversation')} className="flex h-full min-h-0 items-center justify-center p-8">
        <EmptyState
          icon={MessageSquare}
          title="还没有任务"
          description="新建一个任务开始工作。每个任务是一次独立的会话，属于它所在的工作区。"
          action={(
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                actions.setCenterView('conversation')
                void sessions.createSession(directory.activeWorkspaceId)
              }}
            >
              <Plus />
              新建任务
            </Button>
          )}
        />
      </section>
    )
  }

  /**
   * Dispatches a slash command. Side effects (settings, mode, panels) are the
   * feedback; only a dispatch failure — which never reaches the log — is surfaced here.
   */
  const runCommand = async (line: string) => {
    const outcome = await commands.execute(session.sessionId, line)
    if (outcome === undefined) return
    if ('code' in outcome) {
      session.setAgentError(outcome.message)
      return
    }
    if (outcome.result.kind === 'error') session.setAgentError(outcome.result.text)
  }

  const goalRef = snapshot.goal?.goal
  const callGoal = (method: 'goal.pause' | 'goal.resume' | 'goal.complete') => () => {
    if (goalRef === undefined) return
    void connection.activeTransport?.call(method, {
      sessionId: session.sessionId,
      ref: { id: goalRef.id, revision: goalRef.revision },
    })
  }

  return (
    <section
      {...focusZoneAttribute('conversation')}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
    >
      <SessionHeader
        title={snapshot.title}
        cwd={snapshot.cwd}
        running={snapshot.running}
        showSidebarToggle={showSidebarToggleInCenter}
        sidebarOpen={sidebarOpen}
        rightOpen={rightSize > 0}
        bottomOpen={bottomSize > 0}
        onRename={title => { void session.rename(title) }}
        onToggleSidebar={actions.toggleSidebar}
        onToggleRight={() => actions.toggleDock('right')}
        onToggleBottom={() => actions.toggleDock('bottom')}
      />

      {snapshot.error === undefined
        ? null
        : (
            <div className="flex shrink-0 items-start gap-2 border-b border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-danger-soft px-5 py-2 text-[11px] text-danger">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{snapshot.error}</span>
              <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => session.clearError()}>
                知道了
              </button>
            </div>
          )}

      <MessageThread
        nodes={snapshot.nodes}
        hasMoreHistory={snapshot.hasMoreHistory}
        historyLoading={snapshot.historyLoading}
        question={snapshot.question}
        onLoadOlder={() => { void session.loadOlderHistory() }}
        onApprove={approvalId => { void session.resolveApproval(approvalId, 'allowed-once') }}
        onReject={approvalId => { void session.resolveApproval(approvalId, 'rejected') }}
        onAnswer={answers => { void session.answerQuestion(answers) }}
        onCancelQuestion={() => { void session.cancelQuestion() }}
        onSuggestionSelect={text => composerRef.current?.fill(text)}
      />

      <InputDock
        todos={snapshot.todos}
        queue={snapshot.queue}
        goal={snapshot.goal}
        onRemoveQueued={itemId => { void session.removeQueueItem(itemId) }}
        onSteerQueued={itemId => { void session.steerQueueItem(itemId) }}
        onPauseGoal={callGoal('goal.pause')}
        onResumeGoal={callGoal('goal.resume')}
        onCompleteGoal={callGoal('goal.complete')}
      />

      <Composer
        ref={composerRef}
        running={snapshot.running}
        disabled={connection.activeTransport === undefined}
        models={snapshot.models}
        commands={catalog.commands}
        onLoadModels={() => { void session.loadModels() }}
        onSelectModel={(provider, model, reasoningEffort) => { void session.selectModel(provider, model, reasoningEffort) }}
        onSend={(content, mode) => { void session.prompt(content, mode) }}
        onCommand={line => { void runCommand(line) }}
        onCancel={() => { void session.cancel() }}
      />
    </section>
  )
}
