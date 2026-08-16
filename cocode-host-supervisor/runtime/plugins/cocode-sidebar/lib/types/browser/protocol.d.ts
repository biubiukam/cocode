/**
 * The browser wire vocabulary shared by BOTH halves: the host drives a real
 * Chromium through CDP, the client renders its screencast into a canvas and
 * sends input back. Every type here is plain data.
 *
 * This module must stay FREE of Node.js types and of any runtime import —
 * the client bundle imports it (types only) and the build's purity gate
 * rejects Node builtins reaching browser code.
 *
 * Two transports carry the two audiences, deliberately:
 * - The human rides `/sidebar/ws/browser`: continuous low-latency frames.
 * - The agent rides the `browser_*` tools: durable, replayable snapshots.
 * Both drive the SAME page, so what the model reads is what the user sees.
 */
/** Frame header preceding the JPEG payload of one screencast binary frame. */
export interface BrowserFrameHeader {
    /** Monotonic per-tab frame counter (the client drops out-of-order frames). */
    seq: number;
    /** Natural pixel width of the JPEG payload. */
    width: number;
    /** Natural pixel height of the JPEG payload. */
    height: number;
    /** CSS pixel width the frame represents (page viewport, not device pixels). */
    cssWidth: number;
    /** CSS pixel height the frame represents. */
    cssHeight: number;
}
/** Live page state projected to the toolbar on every navigation transition. */
export interface BrowserTabState {
    url: string;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    /** Who currently drives the page (an agent lease shows a badge in the UI). */
    owner: BrowserOwner;
    /** Persistent profile this page is using (shared vs agent-isolated). */
    profile: string;
}
/** Exclusive driver of one tab. A human input event always preempts an agent. */
export type BrowserOwner = 'human' | 'agent';
/** Lifecycle of the Chromium binary the host drives. */
export type BrowserEngineState = 'missing' | 'installing' | 'ready' | 'error';
/** Engine readiness projected to the UI (drives the install prompt). */
export interface BrowserEngineStatus {
    state: BrowserEngineState;
    /** Human-readable progress or failure detail; absent when plainly ready. */
    message?: string;
}
/** A pending native dialog blocking the page until it is answered. */
export interface BrowserDialog {
    kind: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
    message: string;
    /** Default value of a `prompt()` dialog. */
    defaultValue?: string;
}
/** Mouse event kinds the viewport forwards. */
export type BrowserMouseKind = 'move' | 'down' | 'up' | 'wheel';
/** Keyboard event kinds the viewport forwards. */
export type BrowserKeyKind = 'down' | 'up';
/** One input or control frame sent by the viewport. */
export type BrowserClientFrame = 
/** Navigate this tab to a normalized http(s) URL. */
{
    t: 'open';
    url: string;
}
/** History / loading control. */
 | {
    t: 'nav';
    to: 'back' | 'forward' | 'reload' | 'stop';
}
/** The canvas size changed; the host resizes the page viewport to match. */
 | {
    t: 'viewport';
    width: number;
    height: number;
    dpr: number;
} | {
    t: 'mouse';
    kind: BrowserMouseKind;
    /** CSS pixel coordinates inside the page viewport. */
    x: number;
    y: number;
    button: 'none' | 'left' | 'middle' | 'right';
    /** Bitmask of currently pressed buttons (CDP `buttons`). */
    buttons: number;
    clickCount?: number;
    deltaX?: number;
    deltaY?: number;
    /** CDP modifier bitmask: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift. */
    modifiers: number;
} | {
    t: 'key';
    kind: BrowserKeyKind;
    key: string;
    code: string;
    keyCode: number;
    modifiers: number;
    /** Printable text of the keypress, when the key produces any. */
    text?: string;
}
/**
 * Commit text directly into the focused element. This is the IME and paste
 * path: composing per-keystroke would render candidates in the HOST page
 * and corrupt the remote input, so the viewport only forwards the COMMITTED
 * string.
 */
 | {
    t: 'insert';
    text: string;
}
/** Ask the host for the page's current selection (clipboard copy). */
 | {
    t: 'copy';
}
/** Answer the pending native dialog. */
 | {
    t: 'dialog';
    accept: boolean;
    text?: string;
}
/**
 * Start or stop watching this page. A hidden sidebar tab keeps the page
 * alive but drops the screencast — encoding JPEG of a page nobody can see
 * is the single largest idle cost of the feature.
 */
 | {
    t: 'watch';
    on: boolean;
}
/** Cancel the in-flight download, if any. */
 | {
    t: 'download-cancel';
}
/** Grant or deny one permission for the current origin. */
 | {
    t: 'permission';
    name: string;
    grant: boolean;
}
/** Release the page (the user closed the tab). */
 | {
    t: 'close';
};
/** Tab id prefix of a page the model opened. */
export declare const AGENT_BROWSER_PREFIX = "browser:agent-";
/** Tab id prefix of a popup the page opened (OAuth, window.open). */
export declare const POPUP_BROWSER_PREFIX = "browser:popup-";
/** Tabs the sidebar must reconcile from the host list (agent + popup). */
export declare function isReconciledBrowserTabId(tabId: string): boolean;
/** One state or notification frame pushed to the viewport. */
export type BrowserServerFrame = {
    t: 'state';
    state: BrowserTabState;
} | {
    t: 'engine';
    status: BrowserEngineStatus;
} | {
    t: 'dialog';
    dialog: BrowserDialog | null;
} | {
    t: 'download';
    name: string;
    path: string;
} | {
    t: 'copy';
    text: string;
} | {
    t: 'error';
    code: string;
    message: string;
};
/** One accessible node the model can address. */
export interface BrowserNode {
    /**
     * Short handle valid ONLY for the snapshot generation that produced it.
     * Acting on a ref from an older generation fails with a stale error rather
     * than silently hitting whatever now occupies that position.
     */
    ref: string;
    role: string;
    /** Accessible name (bounded, redacted). */
    name?: string;
    /** Current value for inputs/selects (bounded, redacted, masked if secret). */
    value?: string;
    /** True when the node accepts pointer or keyboard interaction. */
    interactive: boolean;
    /** Set when the node reports a checked/selected/expanded/disabled state. */
    checked?: boolean;
    selected?: boolean;
    expanded?: boolean;
    disabled?: boolean;
    /** Whether the node's box intersects the current viewport. */
    inViewport: boolean;
    /** Depth in the retained tree, so the model can read structure from a flat list. */
    depth: number;
}
/** Why a snapshot omitted nodes, so the model never mistakes it for the whole page. */
export interface BrowserTruncation {
    totalNodes: number;
    returnedNodes: number;
    hint: string;
}
/** One page observation. */
export interface BrowserSnapshot {
    tabId: string;
    /** Bumped by every action and every human input; refs belong to one generation. */
    generation: number;
    url: string;
    title: string;
    viewport: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    focusedRef?: string;
    nodes: BrowserNode[];
    truncation?: BrowserTruncation;
    /** File-backed screenshot; never inline base64 (that would bloat the session log). */
    screenshot?: {
        id: string;
        mediaType: 'image/jpeg';
    };
    /** Cross-origin iframes this snapshot did not flatten. */
    unexpandedFrames?: Array<{
        url: string;
    }>;
    /** True when `nodes` is a delta against the previous snapshot, not the full tree. */
    delta?: boolean;
    /** A native dialog is blocking the page; act({kind:'dialog'}) to clear it. */
    pendingDialog?: BrowserDialog;
}
/** Every page action the model may dispatch, one per `browser_act` call. */
export type BrowserAction = {
    kind: 'click';
    ref: string;
    button?: 'left' | 'right';
    modifiers?: readonly BrowserModifier[];
} | {
    kind: 'hover';
    ref: string;
} | {
    kind: 'type';
    ref: string;
    text: string;
    clear?: boolean;
    submit?: boolean;
    sensitive?: boolean;
} | {
    kind: 'press';
    key: string;
    ref?: string;
} | {
    kind: 'scroll';
    direction: 'up' | 'down';
    amount?: number;
    ref?: string;
} | {
    kind: 'select';
    ref: string;
    values: readonly string[];
} | {
    kind: 'navigate';
    to: 'back' | 'forward' | 'reload';
} | {
    kind: 'upload';
    ref: string;
    paths: readonly string[];
} | {
    kind: 'dialog';
    accept: boolean;
    text?: string;
} | {
    kind: 'wait';
    condition: 'load' | 'network-idle' | 'text' | 'url';
    value?: string;
};
/** Keyboard modifiers an action may hold down. */
export type BrowserModifier = 'Alt' | 'Control' | 'Meta' | 'Shift';
/** Action kinds that are safe to retry after an unknown outcome. */
export declare const IDEMPOTENT_ACTIONS: readonly BrowserAction['kind'][];
/** Structured failure codes the agent tools surface instead of throwing raw. */
export declare const BROWSER_ERRORS: {
    readonly stale: "BROWSER_STALE_SNAPSHOT";
    readonly leaseRevoked: "BROWSER_LEASE_REVOKED";
    readonly timeout: "BROWSER_ACTION_TIMEOUT";
    readonly dialogPending: "BROWSER_DIALOG_PENDING";
    readonly engineNotReady: "BROWSER_ENGINE_NOT_READY";
    readonly unknownTab: "BROWSER_UNKNOWN_TAB";
    readonly blocked: "BROWSER_NAVIGATION_BLOCKED";
    readonly confirmation: "BROWSER_CONFIRMATION_REQUIRED";
    readonly unavailable: "BROWSER_CAPABILITY_UNAVAILABLE";
};
/** Machine-readable browser failure identity. */
export type BrowserErrorCode = (typeof BROWSER_ERRORS)[keyof typeof BROWSER_ERRORS];
/** One browser failure carrying a stable code the model can branch on. */
export declare class BrowserError extends Error {
    readonly code: BrowserErrorCode;
    constructor(code: BrowserErrorCode, message: string);
}
