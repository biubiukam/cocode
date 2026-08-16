/**
 * Tab registry. A tab is a Chromium page plus the state the human UI and the
 * agent both read: ownership, generation, a pending dialog and downloads.
 *
 * Generation is the synchronisation point between the two drivers. Anything
 * that can move the page under the agent's feet bumps it, which is what makes
 * a stale `ref` detectable instead of silently wrong.
 */
import type { BrowserContext, CDPSession, Download, Page } from "playwright-core"
import type { BrowserEngine } from "./engine.ts"
import { DEFAULT_PROFILE } from "./engine.ts"
import { assertNavigable, normalizeUrl, registrableDomain, type PolicyOptions } from "./policy.ts"
import {
  BrowserError,
  type BrowserDialogState,
  type BrowserDownloadState,
  type BrowserTabOwner,
  type BrowserTabView,
} from "./protocol.ts"

const MAX_TABS = 12
const DIALOG_TIMEOUT_MS = 30_000

export interface TabRefEntry {
  readonly backendNodeId: number
  readonly role: string
  readonly name?: string
}

export class BrowserTab {
  owner: BrowserTabOwner
  /**
   * Workbench panel instance showing this tab. The panel is the only tab strip:
   * one panel drives exactly one tab, and a tab without a panel is one the user
   * cannot see yet — an agent tab or a popup.
   */
  panelId?: string
  generation = 1
  title = ""
  loading = false
  dialog?: BrowserDialogState
  /** Refs handed to the agent by the last snapshot of this tab. */
  refs = new Map<string, TabRefEntry>()
  /** Registrable domain the agent started on, for the cross-site boundary. */
  agentOrigin?: string
  private dialogTimer?: NodeJS.Timeout
  private resolveDialog?: (value: { accept: boolean; text?: string }) => void

  constructor(
    readonly id: string,
    readonly profile: string,
    readonly page: Page,
    readonly cdp: CDPSession,
    owner: BrowserTabOwner,
  ) {
    this.owner = owner
  }

  get url(): string {
    return this.page.url()
  }

  /** Invalidate agent refs; called by navigation and by every human input. */
  bump(): void {
    this.generation += 1
  }

  view(): BrowserTabView {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      owner: this.owner,
      loading: this.loading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      generation: this.generation,
      profile: this.profile,
      ...(this.dialog === undefined ? {} : { dialog: this.dialog }),
    }
  }

  canGoBack = false
  canGoForward = false

  /** Park a native dialog until someone answers it, with a bounded wait. */
  awaitDialogDecision(): Promise<{ accept: boolean; text?: string }> {
    return new Promise(resolve => {
      this.resolveDialog = resolve
      this.dialogTimer = setTimeout(() => { this.settleDialog({ accept: false }) }, DIALOG_TIMEOUT_MS)
    })
  }

  settleDialog(decision: { accept: boolean; text?: string }): void {
    if (this.dialogTimer !== undefined) clearTimeout(this.dialogTimer)
    this.dialogTimer = undefined
    const resolve = this.resolveDialog
    this.resolveDialog = undefined
    resolve?.(decision)
  }

  hasPendingDialog(): boolean {
    return this.dialog !== undefined
  }
}

export interface TabsEvents {
  onChange(): void
  onDownloads(downloads: readonly BrowserDownloadState[]): void
}

export interface OpenTabOptions {
  readonly profile?: string
  readonly owner?: BrowserTabOwner
  readonly url?: string
  readonly panelId?: string
}

let counter = 0
function nextTabId(): string {
  counter += 1
  return `tab-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export class BrowserTabs {
  private readonly tabs = new Map<string, BrowserTab>()
  private readonly downloads = new Map<string, BrowserDownloadState>()
  private readonly adopted = new WeakSet<Page>()
  private readonly watched = new WeakSet<BrowserContext>()

  constructor(
    private readonly engine: BrowserEngine,
    private readonly policy: PolicyOptions,
    private readonly events: TabsEvents,
  ) {}

  list(): readonly BrowserTabView[] {
    return [...this.tabs.values()].map(tab => tab.view())
  }

  require(tabId: string): BrowserTab {
    const tab = this.tabs.get(tabId)
    if (tab === undefined) throw new BrowserError("BROWSER_TAB_NOT_FOUND", `Tab ${tabId} is no longer open.`)
    return tab
  }

  byPanel(panelId: string): BrowserTab | undefined {
    for (const tab of this.tabs.values()) {
      if (tab.panelId === panelId) return tab
    }
    return undefined
  }

  /** Tabs no panel is showing: agent work and site popups. */
  detached(): readonly BrowserTabView[] {
    return [...this.tabs.values()].filter(tab => tab.panelId === undefined).map(tab => tab.view())
  }

  async open(options: OpenTabOptions = {}): Promise<BrowserTab> {
    if (this.tabs.size >= MAX_TABS) {
      throw new BrowserError("BROWSER_TAB_LIMIT", `At most ${String(MAX_TABS)} browser tabs can be open at once.`)
    }
    const profile = options.profile ?? DEFAULT_PROFILE
    const context = await this.engine.context(profile)
    this.watchPopups(context, profile)
    // A persistent context starts with a blank page; claim it before adding one.
    const spare = context.pages().find(page => !this.adopted.has(page))
    const page = spare ?? await context.newPage()
    const tab = await this.adopt(page, profile, options.owner ?? "human")
    if (options.panelId !== undefined) tab.panelId = options.panelId
    if (options.url !== undefined) await this.navigate(tab, options.url)
    return tab
  }

  /**
   * A page the site opened itself — `target=_blank`, an OAuth window — is a real
   * tab the user must be able to see, so it enters the registry detached rather
   * than floating invisibly inside the context. An opener distinguishes it from
   * the pages we create ourselves, which arrive on the same event.
   */
  private watchPopups(context: BrowserContext, profile: string): void {
    if (this.watched.has(context)) return
    this.watched.add(context)
    context.on("page", page => {
      void (async () => {
        const opener = await page.opener()
        if (opener === null || this.adopted.has(page)) return
        const parent = [...this.tabs.values()].find(tab => tab.page === opener)
        const tab = await this.adopt(page, profile, parent?.owner ?? "human")
        // A popup continues the flow that opened it, including its site boundary.
        tab.agentOrigin = parent?.agentOrigin
      })().catch(() => { /* page closed during setup */ })
    })
  }

  /**
   * Wire a page — ours or one the site popped open — into the registry. Popups
   * stay inside the same context so an OAuth flow keeps its session.
   */
  async adopt(page: Page, profile: string, owner: BrowserTabOwner): Promise<BrowserTab> {
    this.adopted.add(page)
    const cdp = await page.context().newCDPSession(page)
    const tab = new BrowserTab(nextTabId(), profile, page, cdp, owner)
    this.tabs.set(tab.id, tab)
    await this.maskAutomation(tab)
    await this.guardNavigation(tab)
    this.observe(tab)
    this.events.onChange()
    return tab
  }

  /**
   * Headless Chromium announces itself in the user agent, which is the first
   * thing bot protection looks at. The override runs per page because the
   * context-level agent is fixed at launch.
   */
  private async maskAutomation(tab: BrowserTab): Promise<void> {
    try {
      const agent = await tab.page.evaluate(() => navigator.userAgent)
      if (!agent.includes("Headless")) return
      await tab.cdp.send("Emulation.setUserAgentOverride", { userAgent: agent.replace("HeadlessChrome", "Chrome") })
    } catch { /* page navigated away mid-setup */ }
  }

  /** Re-check every document request, so a redirect cannot escape the policy. */
  private async guardNavigation(tab: BrowserTab): Promise<void> {
    await tab.cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request", resourceType: "Document" }],
    })
    tab.cdp.on("Fetch.requestPaused", (event: { requestId: string; request: { url: string } }) => {
      void (async () => {
        try {
          assertNavigable(event.request.url, this.policy)
          await tab.cdp.send("Fetch.continueRequest", { requestId: event.requestId })
        } catch {
          await tab.cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" })
            .catch(() => { /* request already gone */ })
        }
      })()
    })
  }

  private observe(tab: BrowserTab): void {
    const refresh = (): void => {
      tab.title = tab.page.url() === "about:blank" ? "New tab" : tab.title
      this.events.onChange()
    }
    tab.page.on("framenavigated", frame => {
      if (frame !== tab.page.mainFrame()) return
      tab.bump()
      tab.refs.clear()
      tab.loading = true
      refresh()
    })
    tab.page.on("domcontentloaded", () => {
      void tab.page.title().then(title => { tab.title = title; refresh() }, () => { /* closed */ })
    })
    tab.page.on("load", () => {
      tab.loading = false
      void this.refreshHistory(tab)
      void tab.page.title().then(title => { tab.title = title; refresh() }, () => { /* closed */ })
    })
    tab.page.on("crash", () => {
      tab.loading = false
      tab.bump()
      refresh()
    })
    tab.page.on("dialog", dialog => {
      tab.dialog = {
        kind: dialog.type() as BrowserDialogState["kind"],
        message: dialog.message(),
        ...(dialog.defaultValue() === "" ? {} : { defaultValue: dialog.defaultValue() }),
      }
      this.events.onChange()
      void tab.awaitDialogDecision().then(async decision => {
        tab.dialog = undefined
        tab.bump()
        await (decision.accept ? dialog.accept(decision.text) : dialog.dismiss()).catch(() => { /* page gone */ })
        this.events.onChange()
      })
    })
    tab.page.on("download", download => { void this.trackDownload(download) })
    tab.page.on("close", () => {
      this.tabs.delete(tab.id)
      this.events.onChange()
    })
  }

  /** History depth is not exposed by Playwright, so ask CDP directly. */
  private async refreshHistory(tab: BrowserTab): Promise<void> {
    try {
      const history = await tab.cdp.send("Page.getNavigationHistory") as { currentIndex: number; entries: readonly unknown[] }
      tab.canGoBack = history.currentIndex > 0
      tab.canGoForward = history.currentIndex < history.entries.length - 1
    } catch { /* page closed */ }
  }

  private async trackDownload(download: Download): Promise<void> {
    const id = `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const record = (state: BrowserDownloadState): void => {
      this.downloads.set(id, state)
      this.events.onDownloads([...this.downloads.values()])
    }
    record({ id, filename: download.suggestedFilename(), url: download.url(), state: "active" })
    try {
      // Downloads land in the profile directory; the workspace is never a drop target.
      const path = await download.path()
      record({ id, filename: download.suggestedFilename(), url: download.url(), state: "done", ...(path === null ? {} : { path }) })
    } catch {
      record({ id, filename: download.suggestedFilename(), url: download.url(), state: "failed" })
    }
  }

  cancelDownload(id: string): void {
    const existing = this.downloads.get(id)
    if (existing === undefined) return
    this.downloads.set(id, { ...existing, state: "cancelled" })
    this.events.onDownloads([...this.downloads.values()])
  }

  downloadList(): readonly BrowserDownloadState[] {
    return [...this.downloads.values()]
  }

  async navigate(tab: BrowserTab, input: string): Promise<void> {
    const url = normalizeUrl(input)
    assertNavigable(url, this.policy)
    if (tab.owner === "agent") tab.agentOrigin ??= registrableDomain(new URL(url).hostname)
    tab.loading = true
    this.events.onChange()
    try {
      await tab.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
    } catch (error) {
      tab.loading = false
      this.events.onChange()
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("ERR_BLOCKED_BY_CLIENT")) {
        throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", "Navigation was blocked by the browser policy.")
      }
      throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", message)
    }
  }

  async close(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (tab === undefined) return
    this.tabs.delete(tabId)
    await tab.page.close().catch(() => { /* already gone */ })
    this.events.onChange()
  }

  async dispose(): Promise<void> {
    const tabs = [...this.tabs.values()]
    this.tabs.clear()
    await Promise.allSettled(tabs.map(async tab => tab.page.close()))
  }
}
