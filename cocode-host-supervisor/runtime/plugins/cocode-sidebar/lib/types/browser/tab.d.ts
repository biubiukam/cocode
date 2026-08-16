import type { Page } from 'playwright-core';
import { type BrowserAction, type BrowserDialog, type BrowserFrameHeader, type BrowserOwner, type BrowserSnapshot, type BrowserTabState } from './protocol.ts';
import type { CdpSession } from './cdp.ts';
/** Everything a viewport or a tool needs to observe about one tab. */
export interface BrowserTabSummary {
    tabId: string;
    url: string;
    title: string;
    loading: boolean;
    owner: BrowserOwner;
    /** Whether the tab was opened by the model rather than by the user. */
    agentOwned: boolean;
}
/** Sinks a connected viewport installs on the tab. */
export interface TabListener {
    frame(header: BrowserFrameHeader, jpeg: Buffer): void;
    state(state: BrowserTabState): void;
    dialog(dialog: BrowserDialog | null): void;
    download(name: string, path: string): void;
    error(code: string, message: string): void;
}
/** Construction inputs of one tab. */
export interface BrowserTabOptions {
    tabId: string;
    sessionId: string;
    page: Page;
    cdp: CdpSession;
    /** The GUI's own origin, refused by the navigation policy. */
    selfOrigin?: string;
    /** True when the model opened this tab (drives the sidebar reconcile). */
    agentOwned: boolean;
    /** Called whenever this tab's summary changes, so the registry can push. */
    onChange: () => void;
    /** Persistent profile this page belongs to. */
    profile: string;
    /** A `window.open` / OAuth popup — keep it as a real page, never absorb. */
    onPopup?: (page: Page) => void;
    /** The underlying page closed itself (popup finished, crash, target.close). */
    onClosed?: () => void;
    /** Grant a permission on this tab's profile for the current origin. */
    grantPermission?: (origin: string, name: string) => Promise<void>;
}
/** A single browsing context the sidebar renders and the agent drives. */
export declare class BrowserTab {
    readonly tabId: string;
    readonly sessionId: string;
    readonly agentOwned: boolean;
    readonly profile: string;
    private readonly page;
    private readonly cdp;
    private readonly selfOrigin?;
    private readonly onChange;
    private readonly onPopup?;
    private readonly onClosed?;
    private readonly grantPermission?;
    private readonly listeners;
    private loading;
    private ownerRole;
    private agentBadgeTimer;
    private pending;
    private download;
    private acting;
    private lastNodes;
    /** Backend node ids the newest snapshot handed out, cleared on navigation. */
    private refs;
    private generation;
    private screencasting;
    private lastAckAt;
    private ackTimer;
    private frameSeq;
    private viewport;
    constructor(options: BrowserTabOptions);
    /** Create a tab with its own page and CDP session on a shared context. */
    static create(options: Omit<BrowserTabOptions, 'page' | 'cdp'> & {
        newPage: () => Promise<Page>;
        attach: (page: Page) => Promise<CdpSession>;
        /** UA to claim instead of Chromium's own (drops the headless marker). */
        userAgent?: string;
    }): Promise<BrowserTab>;
    /**
     * Wrap an already-open page (a `window.open` popup, an OAuth window).
     * Closing it would break the opener's callback; absorbing it into the
     * parent tab would lose `window.opener` and the login handshake.
     */
    static fromPage(options: Omit<BrowserTabOptions, 'cdp'> & {
        attach: (page: Page) => Promise<CdpSession>;
        userAgent?: string;
    }): Promise<BrowserTab>;
    /** The row the tab list and the toolbar render. */
    summary(): BrowserTabSummary;
    private titleCache;
    /** The full toolbar state, including history availability from CDP. */
    state(): Promise<BrowserTabState>;
    /** Build one model-facing observation of the page. */
    snapshot(options: {
        screenshot: boolean;
        incremental?: boolean;
    }): Promise<BrowserSnapshot>;
    /** Accessible name of a ref from the last snapshot the model read. */
    nameOf(ref: string): string | undefined;
    private captureJpeg;
    /** Navigate to a policy-checked URL. Rejects rather than silently no-oping. */
    open(rawUrl: string): Promise<void>;
    /** History and loading control shared by the toolbar and the model. */
    navigate(to: 'back' | 'forward' | 'reload' | 'stop'): Promise<void>;
    /** Run one model action, marking the tab agent-driven while it lands. */
    act(action: BrowserAction): Promise<string>;
    /**
     * Let the page react before it is observed. A click that starts a
     * navigation or opens a menu needs a beat: snapshotting the instant the
     * event dispatches would hand the model the OLD page and cost it a wasted
     * turn discovering that.
     */
    settle(): Promise<void>;
    private actionContext;
    /** Answer the dialog blocking the page. */
    answerDialog(accept: boolean, text?: string): Promise<void>;
    /** Cancel the in-flight download, if any. */
    cancelDownload(): Promise<void>;
    /** Grant or deny one permission for the current origin. */
    setPermission(name: string, grant: boolean): Promise<void>;
    /** Forward one raw CDP input command from the viewport. */
    input(method: 'Input.dispatchMouseEvent' | 'Input.dispatchKeyEvent' | 'Input.insertText', params: Record<string, unknown>): Promise<void>;
    /** Read the page's current selection, for the viewport's copy shortcut. */
    readSelection(): Promise<string>;
    /** Resize the page viewport to the canvas size the user is looking at. */
    resize(width: number, height: number): Promise<void>;
    /** Attach a viewport; the screencast runs only while someone is watching. */
    subscribe(listener: TabListener): () => void;
    private startScreencast;
    private stopScreencast;
    private restartScreencast;
    /**
     * Chromium withholds the next frame until the previous one is acked, which
     * is the backpressure valve: delaying the ack caps the delivered frame rate
     * and therefore the JPEG encode cost of an animated page.
     */
    private readonly onScreencastFrame;
    /** Close the page and release every CDP resource (idempotent). */
    dispose(): Promise<void>;
    private wirePageEvents;
    private saveDownload;
    private setLoading;
    private pushState;
    /** A human event always wins the badge back from the model, immediately. */
    private markHuman;
    private markAgent;
    private emit;
}
/** Mint an id for a tab the model opened (distinct from the UI's `browser:N`). */
export declare function agentTabId(): string;
/** Mint an id for a `window.open` popup the page itself created. */
export declare function popupTabId(): string;
/** Whether a tab id was minted for the model (drives the sidebar reconcile). */
export declare function isAgentBrowserTabId(tabId: string): boolean;
