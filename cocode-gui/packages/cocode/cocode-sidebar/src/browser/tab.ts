/**
 * One live page: the Chromium page, its CDP session, the screencast that
 * feeds the sidebar viewport, and the ref table the agent tools act through.
 *
 * The human and the agent drive the SAME object. That is the whole point of
 * the design — the model cannot act on a page the user is not looking at, and
 * the user watches every click the model makes land, live, in the panel.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Dialog, Download, Page } from 'playwright-core'
import { buildSnapshot } from './snapshot.ts'
import { dispatchAction } from './actions.ts'
import { dshHome } from './engine.ts'
import { normalizeBrowserUrl } from './url.ts'
import {
  AGENT_BROWSER_PREFIX,
  BROWSER_ERRORS,
  BrowserError,
  POPUP_BROWSER_PREFIX,
  type BrowserAction,
  type BrowserDialog,
  type BrowserFrameHeader,
  type BrowserOwner,
  type BrowserSnapshot,
  type BrowserTabState,
} from './protocol.ts'
import type { CdpSession, ScreencastFrame } from './cdp.ts'

/** How long an agent keeps the "driving" badge after its last action. */
const AGENT_BADGE_MS = 3_000

/** JPEG quality of screencast frames (perceptually fine, ~3x smaller than 90). */
const FRAME_QUALITY = 60

/** Upper bound on delivered frames per second (bounds Chromium's encode cost). */
const MAX_FPS = 20

/** Default per-action timeout. */
const ACTION_TIMEOUT_MS = 15_000

/** Node budget of one snapshot. */
const SNAPSHOT_NODES = 600

/** Quiet period after an action before the page is considered observable. */
const SETTLE_MS = 150

/** Everything a viewport or a tool needs to observe about one tab. */
export interface BrowserTabSummary {
  tabId: string
  url: string
  title: string
  loading: boolean
  owner: BrowserOwner
  /** Whether the tab was opened by the model rather than by the user. */
  agentOwned: boolean
}

/** Sinks a connected viewport installs on the tab. */
export interface TabListener {
  frame(header: BrowserFrameHeader, jpeg: Buffer): void
  state(state: BrowserTabState): void
  dialog(dialog: BrowserDialog | null): void
  download(name: string, path: string): void
  error(code: string, message: string): void
}

/** Construction inputs of one tab. */
export interface BrowserTabOptions {
  tabId: string
  sessionId: string
  page: Page
  cdp: CdpSession
  /** The GUI's own origin, refused by the navigation policy. */
  selfOrigin?: string
  /** True when the model opened this tab (drives the sidebar reconcile). */
  agentOwned: boolean
  /** Called whenever this tab's summary changes, so the registry can push. */
  onChange: () => void
  /** Persistent profile this page belongs to. */
  profile: string
  /** A `window.open` / OAuth popup — keep it as a real page, never absorb. */
  onPopup?: (page: Page) => void
  /** The underlying page closed itself (popup finished, crash, target.close). */
  onClosed?: () => void
  /** Grant a permission on this tab's profile for the current origin. */
  grantPermission?: (origin: string, name: string) => Promise<void>
}

/** A single browsing context the sidebar renders and the agent drives. */
export class BrowserTab {
  readonly tabId: string
  readonly sessionId: string
  readonly agentOwned: boolean
  readonly profile: string
  private readonly page: Page
  private readonly cdp: CdpSession
  private readonly selfOrigin?: string
  private readonly onChange: () => void
  private readonly onPopup?: (page: Page) => void
  private readonly onClosed?: () => void
  private readonly grantPermission?: (origin: string, name: string) => Promise<void>
  private readonly listeners = new Set<TabListener>()

  private loading = false
  private ownerRole: BrowserOwner = 'human'
  private agentBadgeTimer: ReturnType<typeof setTimeout> | undefined
  private pending: { dialog: BrowserDialog; handle: Dialog } | null = null
  private download: Download | null = null
  private acting: AbortController | null = null
  private lastNodes: BrowserSnapshot['nodes'] | null = null

  /** Backend node ids the newest snapshot handed out, cleared on navigation. */
  private refs = new Map<string, number>()
  private generation = 0

  private screencasting = false
  private lastAckAt = 0
  private ackTimer: ReturnType<typeof setTimeout> | undefined
  private frameSeq = 0
  private viewport = { width: 1280, height: 800 }

  constructor(options: BrowserTabOptions) {
    this.tabId = options.tabId
    this.sessionId = options.sessionId
    this.agentOwned = options.agentOwned
    this.profile = options.profile
    this.page = options.page
    this.cdp = options.cdp
    this.selfOrigin = options.selfOrigin
    this.onChange = options.onChange
    this.onPopup = options.onPopup
    this.onClosed = options.onClosed
    this.grantPermission = options.grantPermission
    this.wirePageEvents()
  }

  /** Create a tab with its own page and CDP session on a shared context. */
  static async create(options: Omit<BrowserTabOptions, 'page' | 'cdp'> & {
    newPage: () => Promise<Page>
    attach: (page: Page) => Promise<CdpSession>
    /** UA to claim instead of Chromium's own (drops the headless marker). */
    userAgent?: string
  }): Promise<BrowserTab> {
    return await BrowserTab.fromPage({ ...options, page: await options.newPage() })
  }

  /**
   * Wrap an already-open page (a `window.open` popup, an OAuth window).
   * Closing it would break the opener's callback; absorbing it into the
   * parent tab would lose `window.opener` and the login handshake.
   */
  static async fromPage(options: Omit<BrowserTabOptions, 'cdp'> & {
    attach: (page: Page) => Promise<CdpSession>
    userAgent?: string
  }): Promise<BrowserTab> {
    const cdp = await options.attach(options.page)
    await Promise.all([
      cdp.send('DOM.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Accessibility.enable'),
    ])
    // The override has to go through CDP rather than the context option: it
    // must rewrite `navigator.userAgent` too, not just the request header,
    // or the page's own scripts still see a headless browser.
    if (options.userAgent !== undefined) {
      await cdp.send('Emulation.setUserAgentOverride', { userAgent: options.userAgent }).catch(() => {
        // An older build without the override still browses fine.
      })
    }
    return new BrowserTab({ ...options, cdp })
  }

  // ── Observation ───────────────────────────────────────────────────────────

  /** The row the tab list and the toolbar render. */
  summary(): BrowserTabSummary {
    return {
      tabId: this.tabId,
      url: this.page.url(),
      title: this.titleCache,
      loading: this.loading,
      owner: this.ownerRole,
      agentOwned: this.agentOwned,
    }
  }

  private titleCache = ''

  /** The full toolbar state, including history availability from CDP. */
  async state(): Promise<BrowserTabState> {
    const history = await this.cdp.send('Page.getNavigationHistory').catch(() => undefined) as
      { currentIndex: number; entries: unknown[] } | undefined
    this.titleCache = await this.page.title().catch(() => this.titleCache)
    return {
      url: this.page.url(),
      title: this.titleCache,
      loading: this.loading,
      canGoBack: history !== undefined && history.currentIndex > 0,
      canGoForward: history !== undefined && history.currentIndex < history.entries.length - 1,
      owner: this.ownerRole,
      profile: this.profile,
    }
  }

  /** Build one model-facing observation of the page. */
  async snapshot(options: { screenshot: boolean; incremental?: boolean }): Promise<BrowserSnapshot> {
    const built = await buildSnapshot(this.cdp, { maxNodes: SNAPSHOT_NODES })
    this.refs = built.refs
    const screenshot = options.screenshot ? await this.captureJpeg() : undefined
    const frames: Array<{ url: string }> = []
    for (const frame of this.page.frames()) {
      if (frame === this.page.mainFrame() || frame.url() === '' || frame.url() === 'about:blank') continue
      frames.push({ url: frame.url() })
    }
    const full: BrowserSnapshot = {
      ...built.snapshot,
      tabId: this.tabId,
      generation: this.generation,
      screenshot,
      pendingDialog: this.pending?.dialog,
      unexpandedFrames: frames.length > 0 ? frames : undefined,
    }
    if (options.incremental !== true || this.lastNodes === null) {
      this.lastNodes = full.nodes
      return full
    }
    const changed = diffNodes(this.lastNodes, full.nodes)
    this.lastNodes = full.nodes
    // A delta that is most of the tree is more expensive to read than a full one.
    if (changed.length > full.nodes.length * 0.6) return full
    return { ...full, nodes: changed, delta: true }
  }

  /** Accessible name of a ref from the last snapshot the model read. */
  nameOf(ref: string): string | undefined {
    return this.lastNodes?.find(node => node.ref === ref)?.name
  }

  private async captureJpeg(): Promise<{ id: string; mediaType: 'image/jpeg' } | undefined> {
    const buffer = await this.page.screenshot({ type: 'jpeg', quality: FRAME_QUALITY }).catch(() => undefined)
    if (buffer === undefined) return undefined
    const id = randomUUID()
    const dir = join(dshHome(), 'browsers', 'attachments')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${id}.jpg`), buffer)
    return { id, mediaType: 'image/jpeg' }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Navigate to a policy-checked URL. Rejects rather than silently no-oping. */
  async open(rawUrl: string): Promise<void> {
    const normalized = normalizeBrowserUrl(rawUrl, this.selfOrigin)
    if (normalized.kind === 'invalid') throw new BrowserError(BROWSER_ERRORS.blocked, `"${rawUrl}" is not a usable address`)
    if (normalized.kind === 'blocked') {
      throw new BrowserError(
        BROWSER_ERRORS.blocked,
        normalized.reason === 'self'
          ? 'the Cocode interface itself cannot be opened in the sidebar browser'
          : `the "${rawUrl.split(':')[0] ?? ''}" scheme is not allowed`,
      )
    }
    this.setLoading(true)
    try {
      // A slow page must still become interactive: commit on DOM ready and
      // let the screencast show the rest arriving.
      await this.page.goto(normalized.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    } finally {
      this.setLoading(false)
    }
  }

  /** History and loading control shared by the toolbar and the model. */
  async navigate(to: 'back' | 'forward' | 'reload' | 'stop'): Promise<void> {
    this.setLoading(true)
    try {
      if (to === 'stop') {
        await this.cdp.send('Page.stopLoading').catch(() => { /* nothing was loading */ })
        return
      }
      await dispatchAction(this.actionContext(), { kind: 'navigate', to })
    } finally {
      this.setLoading(false)
    }
  }

  // ── Acting ────────────────────────────────────────────────────────────────

  /** Run one model action, marking the tab agent-driven while it lands. */
  async act(action: BrowserAction): Promise<string> {
    this.acting?.abort()
    const lease = new AbortController()
    this.acting = lease
    this.markAgent()
    try {
      return await dispatchAction(this.actionContext(lease.signal), action)
    } finally {
      if (this.acting === lease) this.acting = null
    }
  }

  /**
   * Let the page react before it is observed. A click that starts a
   * navigation or opens a menu needs a beat: snapshotting the instant the
   * event dispatches would hand the model the OLD page and cost it a wasted
   * turn discovering that.
   */
  async settle(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {
      // A page that never reaches DOMContentLoaded is still worth observing.
    })
    await new Promise(resolve => setTimeout(resolve, SETTLE_MS))
  }

  private actionContext(signal?: AbortSignal) {
    return {
      cdp: this.cdp,
      page: this.page,
      timeoutMs: ACTION_TIMEOUT_MS,
      signal,
      resolveRef: (ref: string): number => {
        const backendNodeId = this.refs.get(ref)
        if (backendNodeId === undefined) {
          throw new BrowserError(
            BROWSER_ERRORS.stale,
            this.refs.size === 0
              ? 'the page navigated since the last snapshot; call browser_snapshot again'
              : `${ref} is not in the current snapshot; call browser_snapshot again`,
          )
        }
        return backendNodeId
      },
      pendingDialog: (): BrowserDialog | null => this.pending?.dialog ?? null,
      answerDialog: async (accept: boolean, text?: string): Promise<void> => { await this.answerDialog(accept, text) },
    }
  }

  /** Answer the dialog blocking the page. */
  async answerDialog(accept: boolean, text?: string): Promise<void> {
    const pending = this.pending
    if (pending === null) return
    this.pending = null
    await (accept ? pending.handle.accept(text) : pending.handle.dismiss()).catch(() => {
      // The page may have gone away while the dialog was open; the cleared
      // pending state is what matters.
    })
    this.emit(listener => { listener.dialog(null) })
  }

  // ── Human input ───────────────────────────────────────────────────────────

  /** Cancel the in-flight download, if any. */
  async cancelDownload(): Promise<void> {
    await this.download?.cancel().catch(() => { /* already finished */ })
    this.download = null
  }

  /** Grant or deny one permission for the current origin. */
  async setPermission(name: string, grant: boolean): Promise<void> {
    if (!grant || this.grantPermission === undefined) return
    let origin: string
    try {
      origin = new URL(this.page.url()).origin
    } catch {
      return
    }
    await this.grantPermission(origin, name)
  }

  /** Forward one raw CDP input command from the viewport. */
  async input(method: 'Input.dispatchMouseEvent' | 'Input.dispatchKeyEvent' | 'Input.insertText', params: Record<string, unknown>): Promise<void> {
    this.markHuman()
    // Hover/move/wheel must not retire refs — they do not change the page
    // the model observed. Clicks, keys and inserted text do.
    const type = typeof params.type === 'string' ? params.type : method
    if (method === 'Input.insertText' || type === 'mousePressed' || type === 'keyDown' || type === 'rawKeyDown') {
      this.generation += 1
      this.refs.clear()
    }
    await this.cdp.send(method, params).catch(() => {
      // Input against a navigating page is routinely refused; dropping the
      // event is correct — the user will simply press again.
    })
  }

  /** Read the page's current selection, for the viewport's copy shortcut. */
  async readSelection(): Promise<string> {
    const response = await this.cdp.send('Runtime.evaluate', {
      expression: 'String(getSelection() ?? "")',
      returnByValue: true,
    }).catch(() => undefined) as { result?: { value?: unknown } } | undefined
    return typeof response?.result?.value === 'string' ? response.result.value : ''
  }

  /** Resize the page viewport to the canvas size the user is looking at. */
  async resize(width: number, height: number): Promise<void> {
    const next = { width: clampDimension(width), height: clampDimension(height) }
    if (next.width === this.viewport.width && next.height === this.viewport.height) return
    this.viewport = next
    await this.page.setViewportSize(next).catch(() => { /* a closing page cannot resize */ })
    if (this.screencasting) await this.restartScreencast()
  }

  // ── Screencast ────────────────────────────────────────────────────────────

  /** Attach a viewport; the screencast runs only while someone is watching. */
  subscribe(listener: TabListener): () => void {
    this.listeners.add(listener)
    if (!this.screencasting) void this.startScreencast()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) void this.stopScreencast()
    }
  }

  private async startScreencast(): Promise<void> {
    if (this.screencasting) return
    this.screencasting = true
    this.cdp.on('Page.screencastFrame', this.onScreencastFrame as (payload: never) => void)
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: FRAME_QUALITY,
      maxWidth: this.viewport.width,
      maxHeight: this.viewport.height,
      everyNthFrame: 1,
    }).catch(() => { this.screencasting = false })
  }

  private async stopScreencast(): Promise<void> {
    if (!this.screencasting) return
    this.screencasting = false
    this.cdp.off('Page.screencastFrame', this.onScreencastFrame as (payload: never) => void)
    if (this.ackTimer !== undefined) clearTimeout(this.ackTimer)
    this.ackTimer = undefined
    await this.cdp.send('Page.stopScreencast').catch(() => { /* the page is already gone */ })
  }

  private async restartScreencast(): Promise<void> {
    await this.stopScreencast()
    await this.startScreencast()
  }

  /**
   * Chromium withholds the next frame until the previous one is acked, which
   * is the backpressure valve: delaying the ack caps the delivered frame rate
   * and therefore the JPEG encode cost of an animated page.
   */
  private readonly onScreencastFrame = (payload: ScreencastFrame): void => {
    const jpeg = Buffer.from(payload.data, 'base64')
    this.frameSeq += 1
    const header: BrowserFrameHeader = {
      seq: this.frameSeq,
      width: payload.metadata.deviceWidth,
      height: payload.metadata.deviceHeight,
      cssWidth: this.viewport.width,
      cssHeight: this.viewport.height,
    }
    this.emit(listener => { listener.frame(header, jpeg) })
    const interval = 1000 / MAX_FPS
    const wait = Math.max(0, this.lastAckAt + interval - Date.now())
    if (this.ackTimer !== undefined) clearTimeout(this.ackTimer)
    this.ackTimer = setTimeout(() => {
      this.lastAckAt = Date.now()
      void this.cdp.send('Page.screencastFrameAck', { sessionId: payload.sessionId }).catch(() => {
        // The screencast stopped between the frame and its ack.
      })
    }, wait)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Close the page and release every CDP resource (idempotent). */
  async dispose(): Promise<void> {
    await this.stopScreencast()
    if (this.agentBadgeTimer !== undefined) clearTimeout(this.agentBadgeTimer)
    await this.cdp.detach().catch(() => { /* detaching a closed page is fine */ })
    await this.page.close().catch(() => { /* already closed */ })
  }

  private wirePageEvents(): void {
    this.page.on('framenavigated', (frame) => {
      if (frame !== this.page.mainFrame()) return
      // Backend node ids belong to one document; a navigation retires every
      // ref the last snapshot handed out.
      this.refs.clear()
      this.generation += 1
      const verdict = normalizeBrowserUrl(frame.url(), this.selfOrigin)
      if (verdict.kind !== 'ok' && !frame.url().startsWith('about:')) {
        this.emit(listener => { listener.error(BROWSER_ERRORS.blocked, `navigation to ${frame.url()} was refused by policy`) })
        void this.page.goBack().catch(() => { /* nothing to go back to */ })
        return
      }
      void this.pushState()
    })
    this.page.on('load', () => { this.setLoading(false) })
    this.page.on('domcontentloaded', () => { void this.pushState() })
    this.page.on('dialog', (dialog: Dialog) => {
      this.pending = {
        handle: dialog,
        dialog: {
          kind: dialog.type() as BrowserDialog['kind'],
          message: dialog.message(),
          defaultValue: dialog.defaultValue() === '' ? undefined : dialog.defaultValue(),
        },
      }
      this.emit(listener => { listener.dialog(this.pending?.dialog ?? null) })
    })
    this.page.on('download', (download: Download) => { void this.saveDownload(download) })
    // OAuth and `window.open` need the popup to stay a live page with its
    // own opener relationship. Folding it into this tab would break login.
    this.page.on('popup', (popup: Page) => { this.onPopup?.(popup) })
    this.page.on('close', () => {
      this.emit(listener => { listener.error('BROWSER_PAGE_CLOSED', 'the page was closed') })
      this.onClosed?.()
    })
  }

  private async saveDownload(download: Download): Promise<void> {
    this.download = download
    const path = await download.path().catch(() => undefined)
    if (path === undefined) return
    this.emit(listener => { listener.download(download.suggestedFilename(), path) })
  }

  private setLoading(value: boolean): void {
    if (this.loading === value) return
    this.loading = value
    void this.pushState()
  }

  private async pushState(): Promise<void> {
    const state = await this.state().catch(() => undefined)
    if (state === undefined) return
    this.emit(listener => { listener.state(state) })
    this.onChange()
  }

  /** A human event always wins the badge back from the model, immediately. */
  private markHuman(): void {
    if (this.acting !== null) {
      this.acting.abort()
      this.acting = null
    }
    if (this.agentBadgeTimer !== undefined) clearTimeout(this.agentBadgeTimer)
    this.agentBadgeTimer = undefined
    if (this.ownerRole === 'human') return
    this.ownerRole = 'human'
    void this.pushState()
  }

  private markAgent(): void {
    if (this.agentBadgeTimer !== undefined) clearTimeout(this.agentBadgeTimer)
    this.agentBadgeTimer = setTimeout(() => { this.markHuman() }, AGENT_BADGE_MS)
    if (this.ownerRole === 'agent') return
    this.ownerRole = 'agent'
    void this.pushState()
  }

  private emit(deliver: (listener: TabListener) => void): void {
    for (const listener of this.listeners) {
      try {
        deliver(listener)
      } catch {
        // One broken viewport must not stall the page or the other viewers.
      }
    }
  }
}

/** Mint an id for a tab the model opened (distinct from the UI's `browser:N`). */
export function agentTabId(): string {
  return `${AGENT_BROWSER_PREFIX}${randomUUID().slice(0, 8)}`
}

/** Mint an id for a `window.open` popup the page itself created. */
export function popupTabId(): string {
  return `${POPUP_BROWSER_PREFIX}${randomUUID().slice(0, 8)}`
}

/** Whether a tab id was minted for the model (drives the sidebar reconcile). */
export function isAgentBrowserTabId(tabId: string): boolean {
  return tabId.startsWith(AGENT_BROWSER_PREFIX)
}

/** Keep a viewport dimension inside what Chromium will accept. */
function clampDimension(value: number): number {
  return Math.min(4096, Math.max(200, Math.round(value)))
}

/** Nodes that appeared or changed since the last snapshot. */
function diffNodes(
  previous: BrowserSnapshot['nodes'],
  next: BrowserSnapshot['nodes'],
): BrowserSnapshot['nodes'] {
  const prior = new Map(previous.map(node => [node.ref, node]))
  return next.filter(node => {
    const old = prior.get(node.ref)
    return old === undefined
      || old.role !== node.role
      || old.name !== node.name
      || old.value !== node.value
      || old.checked !== node.checked
      || old.selected !== node.selected
      || old.expanded !== node.expanded
      || old.disabled !== node.disabled
  })
}
