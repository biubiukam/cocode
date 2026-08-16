/**
 * The viewport's half of the browser transport: one reconnecting WebSocket,
 * frame decoding, and the input translation that turns DOM events into the
 * CDP vocabulary the host forwards to Chromium.
 *
 * Kept out of the React component so the translation rules — which are where
 * the subtle bugs live (modifier masks, IME composition, wheel deltas) — are
 * plain functions that can be reasoned about and tested without a DOM.
 */
import type { BrowserClientFrame, BrowserDialog, BrowserEngineStatus, BrowserFrameHeader, BrowserTabState } from '../browser/protocol.ts';
/** Sinks the component installs on the connection. */
export interface ViewportHandlers {
    frame(header: BrowserFrameHeader, jpeg: Blob): void;
    state(state: BrowserTabState): void;
    engine(status: BrowserEngineStatus): void;
    dialog(dialog: BrowserDialog | null): void;
    download(name: string, path: string): void;
    copy(text: string): void;
    error(code: string, message: string): void;
    connected(open: boolean): void;
}
/**
 * Split one binary frame into its JSON header and the JPEG bytes. The layout
 * is a 4-byte big-endian header length, the UTF-8 header, then the payload
 * (see the host's `encodeFrame`).
 */
export declare function decodeFrame(buffer: ArrayBuffer): {
    header: BrowserFrameHeader;
    jpeg: Blob;
} | undefined;
/** A reconnecting connection to one browser tab's viewport channel. */
export declare class BrowserConnection {
    private readonly query;
    private readonly handlers;
    private socket;
    private retry;
    private closed;
    constructor(query: {
        sessionId: string;
        tabId: string;
    }, handlers: ViewportHandlers);
    private connect;
    private receive;
    /** Send one frame; silently dropped while the socket is down. */
    send(frame: BrowserClientFrame): void;
    /** Stop reconnecting and drop the socket. */
    dispose(): void;
}
/** The modifier flags of any DOM event, as CDP's bitmask. */
export declare function modifiersOf(event: {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}): number;
/**
 * Map a pointer position on the canvas element into CSS pixels of the remote
 * page. The two are normally 1:1 — the host resizes the page to the canvas —
 * but a click landing between a resize and its first frame must still hit
 * the right place, so the ratio is applied rather than assumed.
 */
export declare function pointOf(event: {
    clientX: number;
    clientY: number;
}, rect: {
    left: number;
    top: number;
    width: number;
    height: number;
}, page: {
    cssWidth: number;
    cssHeight: number;
}): {
    x: number;
    y: number;
};
/** Build one mouse frame from a DOM pointer event. */
export declare function mouseFrameOf(kind: 'move' | 'down' | 'up', event: MouseEvent, point: {
    x: number;
    y: number;
}): BrowserClientFrame;
/** Build one wheel frame, normalizing the browser's three delta modes to pixels. */
export declare function wheelFrameOf(event: WheelEvent, point: {
    x: number;
    y: number;
}): BrowserClientFrame;
/**
 * The printable text a keypress produces, or undefined for a control key.
 * A key held with Ctrl or Meta is a shortcut, never text — sending both
 * would insert the character AND fire the shortcut.
 */
export declare function textOf(event: KeyboardEvent): string | undefined;
/** Build one key frame from a DOM keyboard event. */
export declare function keyFrameOf(kind: 'down' | 'up', event: KeyboardEvent): BrowserClientFrame;
/** Whether a keydown belongs to the page rather than to the GUI around it. */
export declare function shouldCapture(event: KeyboardEvent): boolean;
