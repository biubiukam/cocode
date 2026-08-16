/**
 * Wire contract shared by the browser host and the workbench client bundle.
 *
 * This module must stay free of Node and DOM imports: the host runs it under
 * Node and the client inlines it into a browser bundle.
 */

export const BROWSER_STREAM_PATH = "/cocode/workbench/browser.stream"

/** Structured failures the agent and the UI both branch on. */
export type BrowserErrorCode =
  | "BROWSER_ENGINE_NOT_READY"
  | "BROWSER_CAPABILITY_UNAVAILABLE"
  | "BROWSER_NAVIGATION_BLOCKED"
  | "BROWSER_STALE_SNAPSHOT"
  | "BROWSER_LEASE_REVOKED"
  | "BROWSER_ACTION_TIMEOUT"
  | "BROWSER_DIALOG_PENDING"
  | "BROWSER_TAB_LIMIT"
  | "BROWSER_TAB_NOT_FOUND"
  | "BROWSER_REF_NOT_FOUND"
  | "BROWSER_APPROVAL_DENIED"

export class BrowserError extends Error {
  constructor(readonly code: BrowserErrorCode, message: string) {
    super(message)
    this.name = "BrowserError"
  }
}

export function browserErrorCode(error: unknown): BrowserErrorCode | undefined {
  return error instanceof BrowserError ? error.code : undefined
}

/**
 * A host that can actually be resolved. Requiring a real suffix is what keeps
 * a typed phrase from being punycoded into a domain that cannot exist.
 */
function isResolvableHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true
  // Already bracketed by the URL parser, so it is a valid IPv6 literal.
  if (host.startsWith("[")) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true
  const labels = host.split(".")
  if (labels.length < 2) return false
  if (labels.some(label => label === "" || label.startsWith("-") || label.endsWith("-"))) return false
  const suffix = labels.at(-1) ?? ""
  // A numeric last label means it is a number, not a name: "1.5" is not a host.
  return /^[a-z]{2,}$/.test(suffix) || suffix.startsWith("xn--")
}

/**
 * Resolve typed text to the URL it means, or `undefined` if it means nothing.
 *
 * The panel deliberately has no search box: turning a phrase into a query needs
 * a search engine, a locale and a data-sharing decision that belong to the
 * user's own browser, not to a panel that carries their logged-in session. So
 * anything that is not an address is rejected rather than guessed at.
 *
 * Shared with the client, so the address bar refuses exactly what the host does.
 */
export function toWebUrl(input: string): string | undefined {
  const trimmed = input.trim()
  if (trimmed === "") return undefined
  // Only `://` marks a scheme. A bare `localhost:3000` looks like one and is
  // not: treating it as `localhost:` would break the commonest address here.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try { url = new URL(candidate) } catch { return undefined }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
  if (url.username !== "" || url.password !== "") return undefined
  return isResolvableHost(url.hostname) ? url.href : undefined
}

export function isWebAddress(input: string): boolean {
  return toWebUrl(input) !== undefined
}

/** Who currently drives a tab. A tab has exactly one owner at a time. */
export type BrowserTabOwner = "human" | "agent"

export interface BrowserDialogState {
  readonly kind: "alert" | "confirm" | "prompt" | "beforeunload"
  readonly message: string
  readonly defaultValue?: string
}

export interface BrowserDownloadState {
  readonly id: string
  readonly filename: string
  readonly url: string
  readonly bytes?: number
  readonly state: "active" | "done" | "cancelled" | "failed"
  readonly path?: string
}

export interface BrowserTabView {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly owner: BrowserTabOwner
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  /** Bumped by every navigation and every human input; invalidates agent refs. */
  readonly generation: number
  readonly profile: string
  readonly dialog?: BrowserDialogState
}

/**
 * How the Chromium binary was resolved. A locally installed Chrome or Edge is
 * preferred so the first run does not have to download a browser.
 */
export type BrowserEngineSource = "system-chrome" | "system-edge" | "playwright-chromium"

export interface BrowserEngineStatus {
  readonly ready: boolean
  readonly source?: BrowserEngineSource
  readonly executablePath?: string
  /** True when no local browser was found but Playwright Chromium can be fetched. */
  readonly installable: boolean
  readonly installing?: { readonly note: string }
  readonly message?: string
}

/** Binary downlink frame header, JSON-encoded ahead of the JPEG payload. */
export interface BrowserFrameHeader {
  readonly tabId: string
  readonly generation: number
  readonly seq: number
  readonly width: number
  readonly height: number
  readonly deviceScaleFactor: number
}

export type BrowserModifier = "alt" | "ctrl" | "meta" | "shift"

/** Uplink events produced by the human viewport. */
export type BrowserInputEvent =
  /**
   * Bind this socket to a tab. `panelId` is the workbench panel instance, which
   * owns exactly one tab — reattaching with the same id after a reload or a
   * dropped socket returns the same page. `tabId` overrides it to watch a tab
   * the agent opened.
   */
  | { readonly kind: "attach"; readonly panelId: string; readonly sessionId?: string; readonly tabId?: string }
  /** The panel was closed, as opposed to hidden or disconnected: drop the tab. */
  | { readonly kind: "release" }
  | { readonly kind: "subscribe"; readonly enabled: boolean }
  | { readonly kind: "ack"; readonly seq: number }
  | { readonly kind: "viewport"; readonly width: number; readonly height: number; readonly deviceScaleFactor: number }
  | {
    readonly kind: "mouse"
    readonly type: "move" | "down" | "up" | "wheel"
    readonly x: number
    readonly y: number
    readonly button?: "left" | "middle" | "right"
    readonly buttons?: number
    readonly clickCount?: number
    readonly deltaX?: number
    readonly deltaY?: number
    readonly modifiers?: readonly BrowserModifier[]
  }
  | {
    readonly kind: "key"
    readonly type: "down" | "up"
    readonly key: string
    readonly code: string
    readonly text?: string
    readonly modifiers?: readonly BrowserModifier[]
  }
  /** Composition result or host paste: inserted atomically, never key by key. */
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "copy" }
  | { readonly kind: "navigate"; readonly url?: string; readonly to?: "back" | "forward" | "reload" }
  | { readonly kind: "dialog"; readonly accept: boolean; readonly text?: string }
  | { readonly kind: "install" }
  | { readonly kind: "cancelDownload"; readonly id: string }
  | { readonly kind: "approve"; readonly id: string; readonly granted: boolean }
  | { readonly kind: "revoke"; readonly tabId: string }

/** Why the agent is asking before it acts. */
export type BrowserApprovalKind = "side-effect" | "cross-site" | "high-risk"

export interface BrowserApprovalRequest {
  readonly id: string
  readonly tabId: string
  readonly kind: BrowserApprovalKind
  readonly summary: string
  readonly url: string
}

/** Textual downlink messages, interleaved with binary frames on one socket. */
export type BrowserStreamMessage =
  | { readonly kind: "attached"; readonly tabId: string }
  /** State of the one tab this socket is bound to. */
  | { readonly kind: "tab"; readonly tab: BrowserTabView }
  /**
   * Tabs the agent opened that no panel is showing. The client surfaces them so
   * agent browsing is never invisible, and can adopt one into a new panel.
   */
  | { readonly kind: "agentTabs"; readonly tabs: readonly BrowserTabView[] }
  | { readonly kind: "engine"; readonly status: BrowserEngineStatus }
  | { readonly kind: "clipboard"; readonly text: string }
  | { readonly kind: "downloads"; readonly downloads: readonly BrowserDownloadState[] }
  | { readonly kind: "approval"; readonly request: BrowserApprovalRequest }
  | { readonly kind: "approvalResolved"; readonly id: string }
  | { readonly kind: "error"; readonly code: BrowserErrorCode; readonly message: string }

/**
 * One accessibility node exposed to the model. The tree is flattened and
 * `depth` carries the shape, which costs far fewer tokens than nesting.
 */
export interface BrowserNode {
  readonly ref: string
  readonly role: string
  readonly depth: number
  readonly name?: string
  readonly value?: string
  readonly checked?: boolean | "mixed"
  readonly disabled?: boolean
  readonly focused?: boolean
  readonly interactive?: boolean
  readonly inViewport?: boolean
}

export interface BrowserSnapshot {
  readonly tabId: string
  readonly generation: number
  readonly url: string
  readonly title: string
  readonly viewport: { readonly width: number; readonly height: number; readonly deviceScaleFactor: number }
  readonly focusedRef?: string
  readonly nodes: readonly BrowserNode[]
  readonly truncation?: { readonly totalNodes: number; readonly returnedNodes: number; readonly hint: string }
  readonly screenshot?: { readonly attachmentId: string; readonly mediaType: string; readonly width: number; readonly height: number }
  readonly pendingDialog?: BrowserDialogState
  /** Cross-origin frames the first version does not descend into. */
  readonly unexpandedFrames?: number
}

export type BrowserAction =
  | { readonly kind: "click"; readonly ref: string; readonly button?: "left" | "right"; readonly modifiers?: readonly BrowserModifier[] }
  | { readonly kind: "hover"; readonly ref: string }
  | { readonly kind: "type"; readonly ref: string; readonly text: string; readonly clear?: boolean; readonly submit?: boolean; readonly sensitive?: boolean }
  | { readonly kind: "press"; readonly key: string; readonly ref?: string }
  | { readonly kind: "scroll"; readonly direction: "up" | "down"; readonly amount?: number; readonly ref?: string }
  | { readonly kind: "select"; readonly ref: string; readonly values: readonly string[] }
  | { readonly kind: "navigate"; readonly to: "back" | "forward" | "reload" }
  | { readonly kind: "upload"; readonly ref: string; readonly paths: readonly string[] }
  | { readonly kind: "dialog"; readonly accept: boolean; readonly text?: string }
  | { readonly kind: "wait"; readonly condition: "load" | "network-idle" | "text" | "url"; readonly value?: string }

/** Actions that can change state beyond the page the agent is looking at. */
const SIDE_EFFECT_ACTIONS: ReadonlySet<BrowserAction["kind"]> = new Set(["upload", "dialog"])

export function isSideEffectAction(action: BrowserAction): boolean {
  if (SIDE_EFFECT_ACTIONS.has(action.kind)) return true
  return action.kind === "type" && action.submit === true
}

/** Delta returned by an action: only what changed since the previous generation. */
export interface BrowserActionResult {
  readonly tabId: string
  readonly generation: number
  readonly url: string
  readonly title: string
  readonly changed: readonly BrowserNode[]
  readonly removed: readonly string[]
  /** Set when the delta was larger than the budget and a full snapshot is enclosed. */
  readonly full?: BrowserSnapshot
  readonly pendingDialog?: BrowserDialogState
  readonly note?: string
}

const HEADER_LENGTH_BYTES = 4

/** Encode `[4-byte header length][JSON header][JPEG payload]`. */
export function encodeFrame(header: BrowserFrameHeader, payload: Uint8Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const frame = new Uint8Array(HEADER_LENGTH_BYTES + headerBytes.byteLength + payload.byteLength)
  new DataView(frame.buffer).setUint32(0, headerBytes.byteLength, false)
  frame.set(headerBytes, HEADER_LENGTH_BYTES)
  frame.set(payload, HEADER_LENGTH_BYTES + headerBytes.byteLength)
  return frame
}

export function decodeFrame(frame: Uint8Array): { header: BrowserFrameHeader; payload: Uint8Array } | undefined {
  if (frame.byteLength < HEADER_LENGTH_BYTES) return undefined
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const headerLength = view.getUint32(0, false)
  const payloadStart = HEADER_LENGTH_BYTES + headerLength
  if (headerLength === 0 || payloadStart > frame.byteLength) return undefined
  try {
    const header = JSON.parse(new TextDecoder().decode(frame.subarray(HEADER_LENGTH_BYTES, payloadStart))) as BrowserFrameHeader
    return { header, payload: frame.subarray(payloadStart) }
  } catch { return undefined }
}
