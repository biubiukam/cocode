/**
 * Local Dock / panel preferences (RFC dock-panel-depth §4.2).
 * Host plugin-settings is the wrong store — these are GUI-only.
 */

export type DockPrefs = {
  /** Max user terminal tabs per workspace. */
  terminalLimit: number
  /** When the bottom dock first opens empty, seed a terminal tab. */
  bottomAutoTerminal: boolean
  /** Keep user PTY alive when its Dock tab closes (reattach via list). */
  terminalKeepAlive: boolean
  /** Open http(s) links from the conversation in the Browser panel. */
  browserInterceptLinks: boolean
  /** HTML preview without opaque-origin sandbox (dangerous). */
  htmlViewerNoSandbox: boolean
  /** Auto-open Jobs when a new job appears (default off). */
  autoOpenJobs: boolean
}

const STORAGE_KEY = 'cocode.dock-prefs'
const DEFAULTS: DockPrefs = {
  terminalLimit: 3,
  bottomAutoTerminal: true,
  terminalKeepAlive: false,
  browserInterceptLinks: false,
  htmlViewerNoSandbox: false,
  autoOpenJobs: false,
}

const listeners = new Set<() => void>()

function read(): DockPrefs {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<DockPrefs>
    return {
      terminalLimit: typeof parsed.terminalLimit === 'number' && parsed.terminalLimit > 0
        ? Math.min(12, Math.floor(parsed.terminalLimit))
        : DEFAULTS.terminalLimit,
      bottomAutoTerminal: parsed.bottomAutoTerminal ?? DEFAULTS.bottomAutoTerminal,
      terminalKeepAlive: parsed.terminalKeepAlive ?? DEFAULTS.terminalKeepAlive,
      browserInterceptLinks: parsed.browserInterceptLinks ?? DEFAULTS.browserInterceptLinks,
      htmlViewerNoSandbox: parsed.htmlViewerNoSandbox ?? DEFAULTS.htmlViewerNoSandbox,
      autoOpenJobs: parsed.autoOpenJobs ?? DEFAULTS.autoOpenJobs,
    }
  }
  catch {
    return { ...DEFAULTS }
  }
}

let cached = read()

function write(next: DockPrefs): void {
  cached = next
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  catch {
    // Preference persistence is best-effort.
  }
  for (const listener of listeners) listener()
}

export function getDockPrefs(): DockPrefs {
  return cached
}

export function setDockPrefs(patch: Partial<DockPrefs>): DockPrefs {
  write({ ...cached, ...patch })
  return cached
}

export function subscribeDockPrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const DOCK_PREF_DEFAULTS = DEFAULTS
