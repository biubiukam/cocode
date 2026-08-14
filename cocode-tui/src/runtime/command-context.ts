/** Build the local command context from app-owned callbacks and data. */

import type { TuiAuthInfo, TuiCommandCtx } from './app.ts'
import type { TuiCapabilities } from './capabilities.ts'
import { formatDoctor } from './diagnostics.ts'
import { writeSessionExport } from './export-file.ts'
import { listSessionSummaries } from './sessions-fs.ts'
import { ensureAgentsFile } from './workspace-init.ts'
import type { ConversationNode } from './nodes/types.ts'

export type CommandContextOptions = {
  dispatch: TuiCommandCtx['dispatch']
  newSession: TuiCommandCtx['newSession']
  clearTranscript: TuiCommandCtx['clearTranscript']
  showStatus: TuiCommandCtx['showStatus']
  notice: TuiCommandCtx['notice']
  logout: TuiCommandCtx['logout']
  showDoctor: NonNullable<TuiCommandCtx['showDoctor']>
  cwd: string
  sessionId: string
  nodes: readonly ConversationNode[]
  sessionRoot?: string
  setTheme?: TuiCommandCtx['setTheme']
}

export type AppCommandContextOptions = {
  dispatch: TuiCommandCtx['dispatch']
  sessionId: () => string
  newSession: TuiCommandCtx['newSession']
  clearTranscript: TuiCommandCtx['clearTranscript']
  notice: TuiCommandCtx['notice']
  logout: () => Promise<void>
  beginQuit: () => void
  showStatus: () => void
  initError?: string
  capabilities: TuiCapabilities
  cwd: string
  provider: string
  model: string
  runtimeName: string
  diagnostics: NonNullable<import('./app.ts').TuiAppOptions['diagnostics']>
  auth?: TuiAuthInfo
  nodes: readonly ConversationNode[]
  setTheme?: TuiCommandCtx['setTheme']
}

export function createCommandContext(options: CommandContextOptions): TuiCommandCtx {
  return {
    dispatch: options.dispatch,
    newSession: options.newSession,
    clearTranscript: options.clearTranscript,
    showStatus: options.showStatus,
    notice: options.notice,
    logout: options.logout,
    showDoctor: options.showDoctor,
    setTheme: options.setTheme,
    exportTranscript: async () => {
      const path = await writeSessionExport(options.cwd, options.sessionId, options.nodes)
      options.notice('info', `Exported ${path}`)
    },
    initWorkspace: async () => {
      const result = await ensureAgentsFile(options.cwd)
      options.notice(
        'info',
        result.kind === 'created'
          ? `Created ${result.path}`
          : `AGENTS.md already exists: ${result.path}`,
      )
    },
    resumeSessions: async () => {
      if (options.sessionRoot === undefined) {
        options.notice('error', 'Session root is unavailable.')
        return
      }
      const result = await listSessionSummaries({
        root: options.sessionRoot,
        cwd: options.cwd,
        limit: 8,
      })
      if (result.sessions.length === 0) {
        options.notice('info', 'No sessions found for this workspace.')
        return
      }
      const summary = result.sessions
        .map((session) => `${session.id} (${new Date(session.createdAt).toISOString()})`)
        .join(' · ')
      options.notice('info', `${summary} · history is read-only until session/open wire exists`)
    },
  }
}

export function createAppCommandContext(options: AppCommandContextOptions): TuiCommandCtx {
  return createCommandContext({
    dispatch: options.dispatch,
    newSession: options.newSession,
    clearTranscript: options.clearTranscript,
    showStatus: options.showStatus,
    notice: options.notice,
    logout: async () => {
      if (options.auth === undefined) {
        options.notice('info', 'Not signed in to Cocode.')
        return
      }
      await options.logout()
      options.notice('info', 'Signed out.')
      options.beginQuit()
    },
    showDoctor: () => {
      options.notice(
        'info',
        formatDoctor({
          ...options.diagnostics,
          initError: options.initError,
          runtimeName: options.runtimeName,
          cwd: options.cwd,
          provider: options.provider,
          model: options.model,
          sessionId: options.sessionId(),
          capabilities: options.capabilities,
        }),
      )
    },
    cwd: options.cwd,
    sessionId: options.sessionId(),
    nodes: options.nodes,
    sessionRoot: options.diagnostics.sessionRoot,
    setTheme: options.setTheme,
  })
}
