/**
 * The viewport transport: JPEG frames down, input events up.
 *
 * Frames ride the binary channel with a small JSON header so the client can
 * size its canvas without a second message, and control traffic rides the
 * same socket as JSON text. One socket keeps frame delivery and the input
 * that caused it strictly ordered — a resize can never overtake the frame it
 * invalidates.
 *
 * The socket is a VIEW, not the owner: dropping it leaves the page alive for
 * the reconnect grace, so reloading the GUI does not lose the user's place.
 */
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import type { BrowserEngine } from './engine.ts';
import type { BrowserRegistry } from './registry.ts';
import type { BrowserFrameHeader } from './protocol.ts';
import type { SidebarHttpRequest } from '../context-types.ts';
/**
 * Encode one screencast frame: a 4-byte big-endian header length, the UTF-8
 * JSON header, then the raw JPEG. Length-prefixing (rather than a second
 * message) keeps a frame atomic — the client can never pair a header with the
 * wrong payload.
 */
export declare function encodeFrame(header: BrowserFrameHeader, jpeg: Buffer): Buffer;
/**
 * The origin the GUI itself is served from, refused by the tab's navigation
 * policy. The browser's own `Origin` header is authoritative; the `Host`
 * header is the fallback for clients that omit it.
 */
export declare function selfOriginOf(req: SidebarHttpRequest): string | undefined;
/**
 * Serve one sidebar browser viewport.
 *
 * @param registry - The session tab book.
 * @param engine - Chromium lifecycle, for the install prompt.
 * @param ws - The upgraded socket.
 * @param req - The upgrade request (carries the scope query and the origin).
 */
export declare function attachBrowserViewport(registry: BrowserRegistry, engine: BrowserEngine, ws: WebSocket, req: SidebarHttpRequest): Promise<void>;
/**
 * Push one session's live browser tab list, so tabs the MODEL opened appear
 * in the sidebar on their own — the same reconcile contract the agent
 * terminals use.
 */
export declare function attachBrowserTabList(registry: BrowserRegistry, ws: WebSocket, req: SidebarHttpRequest): void;
/** Cast the structural upgrade request to the `ws` package's expected type. */
export type UpgradeRequest = IncomingMessage;
