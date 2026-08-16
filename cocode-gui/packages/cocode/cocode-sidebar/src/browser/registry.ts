/**
 * The per-session tab book.
 *
 * Tabs are scoped to a conversation exactly like the sidebar's terminals: one
 * agent can never reach another session's pages, and closing a conversation
 * releases its pages. Human tabs (`browser:N`, minted by the sidebar) and
 * agent tabs (`browser:agent-xxxx`, minted by the tools) live in the same
 * book, because they are the same kind of thing — the model listing its tabs
 * sees the one the user is reading, and can act on it.
 */
import type { BrowserContext, Page } from 'playwright-core'
import type { BrowserEngine } from './engine.ts'
import { agentTabId, BrowserTab, type BrowserTabSummary } from './tab.ts'
import type { CdpSession } from './cdp.ts'
import { BROWSER_ERRORS, BrowserError } from './protocol.ts'

/** Registry limits. */
export interface BrowserRegistryOptions {
  /** Live pages one conversation may hold open. */
  tabsPerSession: number
  /** How long an unwatched human tab survives, awaiting a reconnect. */
  reconnectGraceMs: number
}

/** Inputs that vary per tab creation. */
export interface EnsureTabOptions {
  /** The GUI's own origin, refused by this tab's navigation policy. */
  selfOrigin?: string
  /** True when the model, not the user, is opening the tab. */
  agentOwned?: boolean
}

/** Owner of every live page, keyed by session. */
export class BrowserRegistry {
  private readonly tabs = new Map<string, BrowserTab>()
  private readonly watchers = new Map<string, Set<() => void>>()
  /** In-flight creations, so two concurrent attaches share one page. */
  private readonly creating = new Map<string, Promise<BrowserTab>>()
  /** Grace timers of tabs whose viewport disconnected. */
  private readonly pendingCloses = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly engine: BrowserEngine,
    private readonly options: BrowserRegistryOptions,
  ) {}

  /** Resolve an existing tab or create it. */
  async ensure(sessionId: string, tabId: string, options: EnsureTabOptions = {}): Promise<BrowserTab> {
    const key = keyOf(sessionId, tabId)
    const existing = this.tabs.get(key)
    if (existing !== undefined) return existing
    const inFlight = this.creating.get(key)
    if (inFlight !== undefined) return await inFlight
    const created = this.create(sessionId, tabId, options).finally(() => { this.creating.delete(key) })
    this.creating.set(key, created)
    return await created
  }

  /** Open a brand-new tab for the model and return it. */
  async openForAgent(sessionId: string, options: EnsureTabOptions = {}): Promise<BrowserTab> {
    return await this.ensure(sessionId, agentTabId(), { ...options, agentOwned: true })
  }

  private async create(sessionId: string, tabId: string, options: EnsureTabOptions): Promise<BrowserTab> {
    if (this.list(sessionId).length >= this.options.tabsPerSession) {
      throw new BrowserError(
        BROWSER_ERRORS.unknownTab,
        `this conversation already holds ${String(this.options.tabsPerSession)} browser tabs; close one first`,
      )
    }
    const context = await this.engine.context()
    const tab = await BrowserTab.create({
      tabId,
      sessionId,
      selfOrigin: options.selfOrigin,
      agentOwned: options.agentOwned === true,
      onChange: () => { this.notify(sessionId) },
      newPage: async () => await context.newPage(),
      attach: async (page: Page) => await attachCdp(context, page),
    })
    this.tabs.set(keyOf(sessionId, tabId), tab)
    this.notify(sessionId)
    return tab
  }

  /** The live tab, or undefined. */
  get(sessionId: string, tabId: string): BrowserTab | undefined {
    return this.tabs.get(keyOf(sessionId, tabId))
  }

  /** The live tab, or a structured "unknown tab" failure for the model. */
  require(sessionId: string, tabId: string): BrowserTab {
    const tab = this.get(sessionId, tabId)
    if (tab === undefined) {
      throw new BrowserError(BROWSER_ERRORS.unknownTab, `no browser tab "${tabId}" is open in this conversation`)
    }
    return tab
  }

  /**
   * The session's tabs, most recently created last. The model calls this to
   * find the page the user is already looking at rather than opening a
   * duplicate.
   */
  list(sessionId: string): BrowserTabSummary[] {
    const prefix = `${sessionId}\u0000`
    const out: BrowserTabSummary[] = []
    for (const [key, tab] of this.tabs) {
      if (key.startsWith(prefix)) out.push(tab.summary())
    }
    return out
  }

  /** Close one tab. Returns false when it was already gone (idempotent). */
  async close(sessionId: string, tabId: string): Promise<boolean> {
    const key = keyOf(sessionId, tabId)
    const tab = this.tabs.get(key)
    if (tab === undefined) return false
    this.tabs.delete(key)
    await tab.dispose()
    this.notify(sessionId)
    return true
  }

  /** Watch one session's tab list (the sidebar reconciles agent tabs from it). */
  subscribe(sessionId: string, listener: () => void): () => void {
    const set = this.watchers.get(sessionId) ?? new Set()
    set.add(listener)
    this.watchers.set(sessionId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.watchers.delete(sessionId)
    }
  }

  private notify(sessionId: string): void {
    for (const listener of this.watchers.get(sessionId) ?? []) {
      try {
        listener()
      } catch {
        // A dead subscriber must not block the others.
      }
    }
  }

  /** Close every page (plugin teardown, or the feature being switched off). */
  async disposeAll(): Promise<void> {
    const tabs = [...this.tabs.values()]
    this.tabs.clear()
    await Promise.all(tabs.map(async tab => { await tab.dispose() }))
    for (const sessionId of new Set(tabs.map(tab => tab.sessionId))) this.notify(sessionId)
  }

  /** Close only the tabs the model opened (used when its tools are revoked). */
  async disposeAgentTabs(): Promise<void> {
    const doomed = [...this.tabs.entries()].filter(([, tab]) => tab.agentOwned)
    for (const [key] of doomed) this.tabs.delete(key)
    await Promise.all(doomed.map(async ([, tab]) => { await tab.dispose() }))
    for (const sessionId of new Set(doomed.map(([, tab]) => tab.sessionId))) this.notify(sessionId)
  }
}

/** NUL-joined so a session id containing ':' cannot forge another key. */
function keyOf(sessionId: string, tabId: string): string {
  return `${sessionId}\u0000${tabId}`
}

/** Attach a raw CDP session, cast once to the structural mirror. */
async function attachCdp(context: BrowserContext, page: Page): Promise<CdpSession> {
  const session = await context.newCDPSession(page)
  return session as unknown as CdpSession
}
