/**
 * Per-workspace layout persistence (RFC §5.3).
 *
 * Persisting per workspace rather than globally is deliberate: a frontend project
 * keeps Browser open, a library project keeps Terminal open, and one global
 * layout would make each visit undo the other's decision.
 *
 * A stored layout can name a panel this build no longer registers. Such tabs are
 * dropped and the rest of the layout survives — invalidating the whole record
 * would punish the user for our refactor (§13).
 */

import { DOCK_CONFIG, createLayoutState, type DockId, type DockState, type DockTab, type LayoutState } from './types.ts'

const KEY_PREFIX = 'cocode.layout.'
const GLOBAL_KEY = `${KEY_PREFIX}__global__`

function storageKey(workspaceId: string | undefined): string {
  return workspaceId === undefined ? GLOBAL_KEY : `${KEY_PREFIX}${workspaceId}`
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function reviveTabs(value: unknown, isDurable: (panelId: string) => boolean): DockTab[] {
  if (!Array.isArray(value)) return []
  const tabs: DockTab[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const candidate = raw as Partial<DockTab>
    if (typeof candidate.panelId !== 'string' || !isDurable(candidate.panelId)) continue
    const instanceKey = typeof candidate.instanceKey === 'string' ? candidate.instanceKey : null
    // A duplicate identity would give two tabs the same React key and the same
    // focus target; the first one wins.
    if (tabs.some(tab => tab.panelId === candidate.panelId && tab.instanceKey === instanceKey)) continue
    tabs.push({ panelId: candidate.panelId, instanceKey })
  }
  return tabs
}

function reviveDock(dock: DockId, value: unknown, isDurable: (panelId: string) => boolean): DockState {
  const config = DOCK_CONFIG[dock]
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<DockState>
  const tabs = reviveTabs(raw.tabs, isDurable)
  const restoreSize = Math.max(config.minSize, readNumber(raw.restoreSize, config.defaultSize))
  const size = readNumber(raw.size, 0)
  return {
    tabs,
    restoreSize,
    // A dock with no surviving tab has nothing to show; open it closed instead of
    // presenting an empty panel the user never asked for.
    size: tabs.length === 0 ? 0 : (size === 0 ? 0 : Math.max(config.minSize, size)),
    activeIndex: Math.min(Math.max(0, readNumber(raw.activeIndex, 0)), Math.max(0, tabs.length - 1)),
  }
}

/**
 * Loads the layout for a workspace.
 * @param workspaceId - the owning workspace, or `undefined` before one is chosen.
 * @param isDurable - whether a panel id exists in this build and may be restored
 *   from disk. Session-scoped panels are excluded (RFC §5.3).
 * @returns the revived layout, or the default when nothing usable is stored.
 */
export function loadLayout(workspaceId: string | undefined, isDurable: (panelId: string) => boolean): LayoutState {
  const fallback = createLayoutState()
  let raw: string | null
  try {
    raw = globalThis.localStorage.getItem(storageKey(workspaceId))
  }
  catch {
    // Private-mode storage denial: the shell still works, it just forgets.
    return fallback
  }
  if (raw === null) return fallback

  try {
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    return {
      sidebar: readNumber(parsed.sidebar, fallback.sidebar),
      right: reviveDock('right', parsed.right, isDurable),
      bottom: reviveDock('bottom', parsed.bottom, isDurable),
    }
  }
  catch {
    return fallback
  }
}

/**
 * Stores the layout for a workspace.
 * @param workspaceId - the owning workspace.
 * @param state - the layout to persist.
 */
export function saveLayout(workspaceId: string | undefined, state: LayoutState): void {
  try {
    globalThis.localStorage.setItem(storageKey(workspaceId), JSON.stringify(state))
  }
  catch {
    // Storage is full or denied; losing the geometry is preferable to failing the gesture.
  }
}
