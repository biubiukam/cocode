/**
 * One live page: the Chromium page, its CDP session, the screencast that
 * feeds the sidebar viewport, and the ref table the agent tools act through.
 *
 * The human and the agent drive the SAME object. That is the whole point of
 * the design — the model cannot act on a page the user is not looking at, and
 * the user watches every click the model makes land, live, in the panel.
 */
import { randomUUID } from 'node:crypto'
import type { Dialog, Download, Page } from 'playwright-core'
import { buildSnapshot } from './snapshot.ts'
import { dispatchAction } from './actions.ts'
import { normalizeBrowserUrl } from './url.ts'
import {
  BROWSER_ERRORS,
  BrowserError,
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
}

/** A single browsing context the sidebar renders and the agent drives. */
export class BrowserTab {
  readonly tabId: string
  readonly sessionId: string
  readonly agentOwned: boolean
  private readonly page: Page
  private readonly cdp: CdpSession
  private readonly selfOrigin?: string
  private readonly onChange: () => void
  private readonly listeners = new Set<TabListener>()

  private loading = false
  private ownerRole: BrowserOwner = 'human'
  private agentBadgeTimer: ReturnType<typeof setTimeout> | undefined
  private pending: { dialog: BrowserDialog; handle: Dialog } | null = null

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
    this.page = options.page
    this.cdp = options.cdp
    this.selfOrigin = options.selfOrigin
    this.onChange = options.onChange
    this.wirePageEvents()
  }

  /** Create a tab with its own page and CDP session on a shared context. */
  static async create(options: Omit<BrowserTabOptions, 'page' | 'cdp'> & {
    newPage: () => Promise<Page>
    attach: (page: Page) => Promise<CdpSession>
  }): Promise<BrowserTab> {
    const page = await options.newPage()
    const cdp = await options.attach(page)
    await Promise.all([
      cdp.send('DOM.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Accessibility.enable'),
    ])
    return new BrowserTab({ ...options, page, cdp })
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
    }
  }

  /** Build one model-facing observation of the page. */
  async snapshot(options: { screenshot: boolean }): Promise<BrowserSnapshot> {
    const built = await buildSnapshot(this.cdp, { maxNodes: SNAPSHOT_NODES })
    this.refs = built.refs
    const screenshot = options.screenshot ? await this.captureJpeg() : undefined
    return {
      ...built.snapshot,
      tabId: this.tabId,
      generation: this.generation,
      screenshot,
      pendingDialog: this.pending?.dialog,
    }
  }

  private async captureJpeg(): Promise<{ mediaType: 'image/jpeg'; base64: string } | undefined> {
    const buffer = await this.page.screenshot({ type: 'jpeg', quality: FRAME_QUALITY }).catch(() => undefined)
    return buffer === undefined ? undefined : { mediaType: 'image/jpeg', base64: buffer.toString('base64') }
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
    this.markAgent()
    return await dispatchAction(this.actionContext(), action)
  }

  private actionContext() {
    return {
      cdp: this.cdp,
      page: this.page,
      timeoutMs: ACTION_TIMEOUT_MS,
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

  /** Forward one raw CDP input command from the viewport. */
  async input(method: 'Input.dispatchMouseEvent' | 'Input.dispatchKeyEvent' | 'Input.insertText', params: Record<string, unknown>): Promise<void> {
    this.markHuman()
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
    // A popup would be an invisible second page nobody can see or close, so
    // it is folded into this tab: the user follows the link in place, which
    // is also what the model's single-viewport mental model expects.
    this.page.on('popup', (popup: Page) => { void this.absorbPopup(popup) })
    this.page.on('close', () => { this.emit(listener => { listener.error('BROWSER_PAGE_CLOSED', 'the page was closed') }) })
  }

  private async absorbPopup(popup: Page): Promise<void> {
    const url = popup.url()
    await popup.close().catch(() => { /* the popup closed itself */ })
    if (url !== '' && url !== 'about:blank') {
      await this.open(url).catch((error: unknown) => {
        this.emit(listener => { listener.error(BROWSER_ERRORS.blocked, error instanceof Error ? error.message : String(error)) })
      })
    }
  }

  private async saveDownload(download: Download): Promise<void> {
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
  return `browser:agent-${randomUUID().slice(0, 8)}`
}

/** Whether a tab id was minted for the model (drives the sidebar reconcile). */
export function isAgentBrowserTabId(tabId: string): boolean {
  return tabId.startsWith('browser:agent-')
}

/** Keep a viewport dimension inside what Chromium will accept. */
function clampDimension(value: number): number {
  return Math.min(4096, Math.max(200, Math.round(value)))
}
