/**
 * The seam both drivers meet at.
 *
 * The human viewport and the agent tools operate the same pages, so the rules
 * that keep them from corrupting each other live here rather than in either
 * caller: ownership, generation checks, and the approval gate that stops a
 * page from talking an agent into a side effect.
 */
import { BrowserEngine, AGENT_PROFILE, DEFAULT_PROFILE } from "./engine.ts"
import { BrowserTabs, type BrowserTab } from "./tabs.ts"
import { Screencast, type ViewportRequest } from "./screencast.ts"
import { takeDelta, takeSnapshot, type AttachmentSink } from "./snapshot.ts"
import { performAction } from "./actions.ts"
import { isHighRiskUrl, registrableDomain, type PolicyOptions } from "./policy.ts"
import {
  BrowserError,
  isSideEffectAction,
  type BrowserAction,
  type BrowserActionResult,
  type BrowserApprovalKind,
  type BrowserApprovalRequest,
  type BrowserDownloadState,
  type BrowserEngineStatus,
  type BrowserFrameHeader,
  type BrowserSnapshot,
  type BrowserTabView,
} from "./protocol.ts"

const APPROVAL_TIMEOUT_MS = 60_000

export interface RuntimeObserver {
  onTabs(tabs: readonly BrowserTabView[]): void
  onEngine(status: BrowserEngineStatus): void
  onDownloads(downloads: readonly BrowserDownloadState[]): void
  onApproval(request: BrowserApprovalRequest): void
  onApprovalResolved(id: string): void
}

export interface RuntimeOptions {
  readonly policy: PolicyOptions
  readonly attachments?: AttachmentSink
}

interface PendingApproval {
  readonly resolve: (granted: boolean) => void
  readonly timer: NodeJS.Timeout
}

export class BrowserRuntime {
  readonly engine: BrowserEngine
  readonly tabs: BrowserTabs
  private readonly observers = new Set<RuntimeObserver>()
  private readonly screencasts = new Map<string, Screencast>()
  private readonly approvals = new Map<string, PendingApproval>()
  private approvalCounter = 0

  constructor(private readonly options: RuntimeOptions) {
    this.engine = new BrowserEngine(status => { this.emit(observer => { observer.onEngine(status) }) })
    this.tabs = new BrowserTabs(this.engine, options.policy, {
      onChange: () => { this.emit(observer => { observer.onTabs(this.tabs.list()) }) },
      onDownloads: downloads => { this.emit(observer => { observer.onDownloads(downloads) }) },
    })
  }

  observe(observer: RuntimeObserver): () => void {
    this.observers.add(observer)
    return () => { this.observers.delete(observer) }
  }

  private emit(notify: (observer: RuntimeObserver) => void): void {
    for (const observer of this.observers) notify(observer)
  }

  status(): BrowserEngineStatus {
    return this.engine.describe()
  }

  async probe(): Promise<BrowserEngineStatus> {
    return this.engine.probe()
  }

  async install(): Promise<void> {
    await this.engine.install()
  }

  list(): readonly BrowserTabView[] {
    return this.tabs.list()
  }

  // --- human side -----------------------------------------------------------

  /** The tab the viewport shows, creating one on first use. */
  async humanTab(url?: string): Promise<BrowserTab> {
    const existing = this.tabs.first("human")
    if (existing !== undefined) {
      if (url !== undefined) await this.tabs.navigate(existing, url)
      return existing
    }
    return this.tabs.open({ owner: "human", profile: DEFAULT_PROFILE, ...(url === undefined ? {} : { url }) })
  }

  screencast(tab: BrowserTab, onFrame: (header: BrowserFrameHeader, payload: Uint8Array) => void): Screencast {
    const existing = this.screencasts.get(tab.id)
    if (existing !== undefined) return existing
    const cast = new Screencast(tab, onFrame)
    this.screencasts.set(tab.id, cast)
    return cast
  }

  async releaseScreencast(tabId: string): Promise<void> {
    const cast = this.screencasts.get(tabId)
    if (cast === undefined) return
    this.screencasts.delete(tabId)
    await cast.stop()
    cast.dispose()
  }

  async resizeViewport(tab: BrowserTab, viewport: ViewportRequest): Promise<void> {
    await this.screencasts.get(tab.id)?.resize(viewport)
  }

  /**
   * A human touching a tab preempts the agent on it. This is the rule that
   * makes shared login state acceptable: the user can always take over.
   */
  preempt(tab: BrowserTab): void {
    tab.bump()
    if (tab.owner !== "agent") return
    tab.owner = "human"
    this.emit(observer => { observer.onTabs(this.tabs.list()) })
  }

  resolveApproval(id: string, granted: boolean): void {
    const pending = this.approvals.get(id)
    if (pending === undefined) return
    this.approvals.delete(id)
    clearTimeout(pending.timer)
    pending.resolve(granted)
    this.emit(observer => { observer.onApprovalResolved(id) })
  }

  // --- agent side -----------------------------------------------------------

  /** Agent tabs are separate by default, so a lease conflict is the exception. */
  async agentTab(options: { url?: string; isolated?: boolean } = {}): Promise<BrowserTab> {
    return this.tabs.open({
      owner: "agent",
      profile: options.isolated === true ? AGENT_PROFILE : DEFAULT_PROFILE,
      ...(options.url === undefined ? {} : { url: options.url }),
    })
  }

  requireAgentTab(tabId: string): BrowserTab {
    const tab = this.tabs.require(tabId)
    if (tab.owner !== "agent") {
      throw new BrowserError("BROWSER_LEASE_REVOKED", `Tab ${tabId} was taken over by the user.`)
    }
    return tab
  }

  async snapshot(tabId: string, options: { screenshot?: boolean } = {}): Promise<BrowserSnapshot> {
    const tab = this.tabs.require(tabId)
    return takeSnapshot(tab, {
      screenshot: options.screenshot === true,
      ...(this.options.attachments === undefined ? {} : { attachments: this.options.attachments }),
    })
  }

  async act(tabId: string, action: BrowserAction, options: { expectedGeneration?: number; workspace?: string } = {}): Promise<BrowserActionResult> {
    const tab = this.requireAgentTab(tabId)
    if (options.expectedGeneration !== undefined && options.expectedGeneration !== tab.generation) {
      throw new BrowserError("BROWSER_STALE_SNAPSHOT", `The page changed since generation ${String(options.expectedGeneration)}. Take a new snapshot.`)
    }
    await this.gateAction(tab, action)
    await performAction(tab, action, { ...(options.workspace === undefined ? {} : { workspace: options.workspace }) })
    tab.bump()
    return takeDelta(tab)
  }

  async navigateAgent(tabId: string, url: string): Promise<void> {
    const tab = this.requireAgentTab(tabId)
    const target = registrableDomain(new URL(url.includes("://") ? url : `https://${url}`).hostname)
    if (tab.agentOrigin !== undefined && target !== tab.agentOrigin) {
      await this.requireApproval(tab, "cross-site", `Navigate to ${target}, outside the site this task started on.`)
    }
    await this.tabs.navigate(tab, url)
    tab.agentOrigin = target
  }

  /**
   * Page content is attacker-controlled, so an action it invites must never be
   * taken on the page's word alone.
   */
  private async gateAction(tab: BrowserTab, action: BrowserAction): Promise<void> {
    if (isHighRiskUrl(tab.url)) {
      await this.requireApproval(tab, "high-risk", `${action.kind} on ${new URL(tab.url).hostname}, a site where actions carry real consequences.`)
      return
    }
    if (isSideEffectAction(action)) {
      await this.requireApproval(tab, "side-effect", `${action.kind} on ${tab.url}`)
    }
  }

  private async requireApproval(tab: BrowserTab, kind: BrowserApprovalKind, summary: string): Promise<void> {
    if (this.observers.size === 0) {
      throw new BrowserError("BROWSER_APPROVAL_DENIED", `${summary} — this needs confirmation, but the browser panel is not open.`)
    }
    this.approvalCounter += 1
    const id = `approval-${String(this.approvalCounter)}`
    const request: BrowserApprovalRequest = { id, tabId: tab.id, kind, summary, url: tab.url }
    const granted = await new Promise<boolean>(resolve => {
      // Fail closed: an unanswered prompt is a refusal, not a delay.
      const timer = setTimeout(() => { this.approvals.delete(id); resolve(false) }, APPROVAL_TIMEOUT_MS)
      this.approvals.set(id, { resolve, timer })
      this.emit(observer => { observer.onApproval(request) })
    })
    if (!granted) throw new BrowserError("BROWSER_APPROVAL_DENIED", `${summary} — the user did not approve this.`)
  }

  async dispose(): Promise<void> {
    for (const cast of this.screencasts.values()) cast.dispose()
    this.screencasts.clear()
    for (const pending of this.approvals.values()) clearTimeout(pending.timer)
    this.approvals.clear()
    await this.tabs.dispose()
    await this.engine.dispose()
  }
}
