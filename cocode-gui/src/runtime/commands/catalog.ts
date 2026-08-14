/**
 * The slash-command catalog.
 *
 * Commands live behind the Typert Remote channel rather than an apiproxy method,
 * so this is the one place that speaks it. The catalog is per session — a
 * command can be registered against one agent's composition — and it is cached
 * until the host says otherwise: `commands/change` is an unfiltered registry
 * notification, so any change invalidates every session's list.
 */

import type { CommandDescriptor, CommandExecution, HarnessTransport, RpcError } from '@cocode/gui-connection'
import { Notifier } from '../notifier.ts'

export type CommandCatalogSnapshot = {
  /** Commands for the session last loaded; empty until one is. */
  commands: readonly CommandDescriptor[]
  loading: boolean
}

const EMPTY: CommandCatalogSnapshot = { commands: [], loading: false }

export class CommandCatalog {
  private readonly notifier = new Notifier()
  private readonly bySession = new Map<string, readonly CommandDescriptor[]>()
  private readonly inFlight = new Set<string>()
  private snapshotCache = new Map<string, CommandCatalogSnapshot>()

  constructor(private readonly getTransport: () => HarnessTransport | undefined) {}

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener)
  }

  /** The catalog for one session; triggers a load the first time it is asked for. */
  get(sessionId: string | undefined): CommandCatalogSnapshot {
    if (sessionId === undefined) return EMPTY
    const cached = this.snapshotCache.get(sessionId)
    if (cached !== undefined) return cached
    const snapshot: CommandCatalogSnapshot = {
      commands: this.bySession.get(sessionId) ?? [],
      loading: this.inFlight.has(sessionId),
    }
    this.snapshotCache.set(sessionId, snapshot)
    return snapshot
  }

  /** Loads a session's catalog unless it is already cached or in flight. */
  async load(sessionId: string): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    if (this.bySession.has(sessionId) || this.inFlight.has(sessionId)) return
    this.inFlight.add(sessionId)
    this.changed()

    const result = await transport.callRemote('commands/list', { agentId: sessionId })
    this.inFlight.delete(sessionId)
    // A deployment that composes no command registry has no endpoint to answer;
    // an empty catalog is the correct reading, not an error worth surfacing.
    this.bySession.set(sessionId, result.ok ? result.value : [])
    this.changed()
  }

  /**
   * Executes one command line.
   *
   * The line goes to the command registry, not to the model — that is the whole
   * point of the separate channel. Side effects are the feedback; the returned
   * execution is an acknowledgement, not thread content.
   *
   * @param sessionId - the agent whose registry resolves the line.
   * @param line - the full line including its leading slash.
   * @returns the settled execution, or the wire error when dispatch failed.
   */
  async execute(sessionId: string, line: string): Promise<CommandExecution | RpcError | undefined> {
    const transport = this.getTransport()
    if (transport === undefined) {
      return { code: 'internal', message: '尚未连接到 harness。', details: {} }
    }
    const result = await transport.callRemote('commands/execute', { agentId: sessionId, line })
    return result.ok ? result.value : result.error
  }

  /** Drops every cached catalog; the next read reloads. */
  invalidate(): void {
    this.bySession.clear()
    this.inFlight.clear()
    this.changed()
  }

  private changed(): void {
    this.snapshotCache = new Map()
    this.notifier.markDirty()
  }
}

/** Whether a composer line is a command dispatch rather than a prompt. */
export function isCommandLine(text: string): boolean {
  return text.startsWith('/')
}

/** The command name a line names, for matching against the catalog. */
export function commandNameOf(line: string): string {
  return line.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? ''
}
