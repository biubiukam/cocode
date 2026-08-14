/**
 * The carrier contract (RFC §4.2).
 *
 * Every native capability reaches the presentation layer through this object.
 * A missing capability is `undefined` — consumers branch on the capability, never
 * on `platform`, so a capability that later arrives on the web needs no new branch.
 */

import type { AccountHostApi } from './account.ts'

export type { AccountHostApi, AccountProfile, CloudProvision } from './account.ts'

export type HostPlatform = 'electron' | 'browser'

/** How the harness process this GUI talks to came to exist. */
export type HarnessMode = 'embedded' | 'connect'

export type HarnessProcessState =
  | { phase: 'starting' }
  | { phase: 'ready'; baseUrl: string }
  | { phase: 'exited'; code: number | null; signal: string | null; stderrTail: string }
  | { phase: 'failed'; message: string }

export type HarnessEndpointInfo = {
  mode: HarnessMode
  /** Absolute origin, or `''` when the frontend is served same-origin with the harness. */
  baseUrl: string
  state: HarnessProcessState
}

/**
 * Lifecycle of the harness endpoint. Present on every carrier: the browser
 * implementation reports a `connect` endpoint that it does not manage.
 */
export type HarnessHostApi = {
  resolve(): Promise<HarnessEndpointInfo>
  /** Restarts an embedded process, or re-probes a connected one. */
  restart(): Promise<HarnessEndpointInfo>
  /** Subscribes to process state changes; returns the unsubscribe function. */
  onStateChange(listener: (info: HarnessEndpointInfo) => void): () => void
}

/** Embedded browsing for the Browser panel. */
export type EmbeddedBrowserApi = {
  /** The element the panel must mount. `webview` implies full navigation control. */
  kind: 'webview'
  openDevTools(webContentsId: number): Promise<void>
}

/** Native frame controls for the self-drawn title bar. */
export type WindowControlApi = {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  onMaximizedChange(listener: (maximized: boolean) => void): () => void
  /**
   * Left inset the platform reserves for its own traffic lights, in CSS pixels.
   * The sidebar's brand row pads by this much so the two never overlap.
   */
  trafficLightInset: number
}

/** System-wide accelerators, which only a desktop carrier can claim. */
export type ShortcutApi = {
  register(accelerator: string, id: string): Promise<boolean>
  unregister(accelerator: string): Promise<void>
  onTriggered(listener: (id: string) => void): () => void
}

export type HostBridge = {
  platform: HostPlatform
  harness: HarnessHostApi
  /** Absent on the browser carrier; the Browser panel falls back to an iframe. */
  embeddedBrowser?: EmbeddedBrowserApi
  /** Absent on the browser carrier; no self-drawn title bar is rendered. */
  window?: WindowControlApi
  /** Absent on the browser carrier. */
  globalShortcut?: ShortcutApi
  /** Absent on the browser carrier; native PKCE lives in the main process. */
  account?: AccountHostApi
}

/** Whether the harness origin is loopback, which privileged methods require. */
export function isLoopbackOrigin(baseUrl: string): boolean {
  try {
    // Electron's node typecheck has no DOM `location`; read it structurally.
    const href = (globalThis as { location?: { href?: string } }).location?.href
    const url = new URL(baseUrl === '' ? (href ?? 'http://127.0.0.1/') : baseUrl)
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  }
  catch {
    return false
  }
}

declare global {
  interface Window {
    /** Installed by the Electron preload through `contextBridge`. */
    cocode?: HostBridge
  }
}
