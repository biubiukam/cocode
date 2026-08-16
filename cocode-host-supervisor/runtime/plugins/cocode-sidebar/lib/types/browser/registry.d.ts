import type { BrowserEngine } from './engine.ts';
import { BrowserTab, type BrowserTabSummary } from './tab.ts';
import { BrowseScope } from './policy.ts';
/** Registry limits. */
export interface BrowserRegistryOptions {
    /** Live pages one conversation may hold open. */
    tabsPerSession: number;
    /** How long an unwatched human tab survives, awaiting a reconnect. */
    reconnectGraceMs: number;
    /** Shared cookie jar for human tabs. */
    humanProfile: string;
    /** Cookie jar for agent tabs when isolation is on. */
    agentProfile: string;
}
/** Inputs that vary per tab creation. */
export interface EnsureTabOptions {
    /** The GUI's own origin, refused by this tab's navigation policy. */
    selfOrigin?: string;
    /** True when the model, not the user, is opening the tab. */
    agentOwned?: boolean;
}
/** Owner of every live page, keyed by session. */
export declare class BrowserRegistry {
    private readonly engine;
    private readonly options;
    private readonly tabs;
    private readonly watchers;
    /** In-flight creations, so two concurrent attaches share one page. */
    private readonly creating;
    /** Grace timers of tabs whose viewport disconnected. */
    private readonly pendingCloses;
    private readonly scopes;
    private readonly focused;
    private isolateAgent;
    constructor(engine: BrowserEngine, options: BrowserRegistryOptions);
    /** Switch whether agent tabs inherit the human profile. */
    setIsolateAgent(isolate: boolean): void;
    /** The conversation's browse-scope (first domain free, later ones gated). */
    scopeOf(sessionId: string): BrowseScope;
    /** Remember which tab omitted-tabId tools should use. */
    focus(sessionId: string, tabId: string): void;
    /** The focused tab, if it is still open. */
    focusedTab(sessionId: string): BrowserTab | undefined;
    /** Resolve an existing tab or create it. */
    ensure(sessionId: string, tabId: string, options?: EnsureTabOptions): Promise<BrowserTab>;
    /** Open a brand-new tab for the model and return it. */
    openForAgent(sessionId: string, options?: EnsureTabOptions): Promise<BrowserTab>;
    private create;
    /**
     * Keep a `window.open` / OAuth popup as its own tab. Closing it, or
     * navigating the opener in its place, would break the login handshake.
     */
    private adoptPopup;
    /** Drop a tab whose page already closed itself (idempotent). */
    private forget;
    /** The live tab, or undefined. */
    get(sessionId: string, tabId: string): BrowserTab | undefined;
    /** The live tab, or a structured "unknown tab" failure for the model. */
    require(sessionId: string, tabId: string): BrowserTab;
    /**
     * The session's tabs, most recently created last. The model calls this to
     * find the page the user is already looking at rather than opening a
     * duplicate.
     */
    /** Session ids that currently hold at least one tab. */
    sessionIds(): string[];
    list(sessionId: string): BrowserTabSummary[];
    /** Close one tab. Returns false when it was already gone (idempotent). */
    close(sessionId: string, tabId: string): Promise<boolean>;
    /** Close every tab of a conversation that no longer exists. */
    closeSession(sessionId: string): Promise<void>;
    private profileOf;
    /**
     * Release a tab whose viewport disconnected, after the reconnect grace. A
     * page costs a renderer process, so an abandoned tab cannot linger — but a
     * page reload must not lose the user's place either, hence the delay.
     * Agent-owned tabs are exempt: no viewport is ever required to attach to
     * them, so a grace timer would delete the model's work out from under it.
     */
    scheduleClose(sessionId: string, tabId: string): void;
    private cancelClose;
    /** Watch one session's tab list (the sidebar reconciles agent tabs from it). */
    subscribe(sessionId: string, listener: () => void): () => void;
    private notify;
    /** Close every page (plugin teardown, or the feature being switched off). */
    disposeAll(): Promise<void>;
    /** Close only the tabs the model opened (used when its tools are revoked). */
    disposeAgentTabs(): Promise<void>;
}
