/**
 * The Dock state machine (RFC §5).
 *
 * `openPanel` is the only action business code calls. Close, move, and reorder are
 * user gestures. Nothing outside this file decides "which dock" — that judgement
 * lives here, which is what keeps layout reasoning from scattering across every
 * call site that wants to show something.
 */

import { createStore, type StoreApi } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'
import type { PanelRegistry } from '../panels/registry.ts'
import { confirmClosePreview } from '../preview/dirty.ts'
import { getDockPrefs } from '../prefs/dock-prefs.ts'
import { loadLayout, saveLayout } from './persistence.ts'
import {
  COMPACT_BOTTOM_FRACTION,
  CONVERSATION_MIN_WIDTH,
  DOCK_CONFIG,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_NARROW_WIDTH,
  createLayoutState,
  tabKey,
  tierOf,
  type DockId,
  type DockState,
  type CenterView,
  type DockTab,
  type LayoutState,
  type ViewportTier,
} from './types.ts'

export type OpenPanelOptions = {
  target?: unknown
  dock?: DockId
  /** Defaults to true: opening a panel the user asked for should also show it. */
  focus?: boolean
}

export type TabAddress = { dock: DockId; index: number }

export type LayoutStoreState = LayoutState & {
  /** Workspace the persisted record belongs to; `undefined` before one is known. */
  workspaceId: string | undefined
  viewportWidth: number
  viewportHeight: number
  tier: ViewportTier
  /**
   * True while the right dock floats over the conversation instead of squeezing
   * it (§8, ≤980px). The bottom dock never overlays: it belongs to the task area.
   */
  rightOverlay: boolean
  /** True while the sidebar is a drawer rather than a column (§8, ≤740px). */
  sidebarDrawer: boolean
  /** Whether the drawer is currently shown; meaningless outside drawer mode. */
  sidebarDrawerOpen: boolean
  /** Which regions the concession chain closed, so the viewport can restore them. */
  autoClosed: { right: boolean; sidebar: boolean; bottom: boolean }
  /** Tabs with content that changed while inactive; keyed by `tabKey`. */
  unread: Record<string, true>
  /** Most recently activated dock, used when only one may be visible (§8, ≤740px). */
  lastActiveDock: DockId
  /** The center column's active surface; tasks live under `conversation`. */
  centerView: CenterView
}

export type LayoutActions = {
  attachWorkspace(workspaceId: string | undefined): void
  setViewport(width: number, height: number): void

  setSidebarWidth(width: number): void
  toggleSidebar(): void
  setSidebarDrawerOpen(open: boolean): void

  setDockSize(dock: DockId, size: number): void
  toggleDock(dock: DockId): void
  closeDock(dock: DockId): void
  resetDockSize(dock: DockId): void

  openPanel(panelId: string, options?: OpenPanelOptions): void
  activateTab(dock: DockId, index: number): void
  closeTab(dock: DockId, index: number): void
  moveTab(from: TabAddress, to: TabAddress): void

  markUnread(dock: DockId, tab: DockTab): void
  /** Called when a tab becomes active; the dot is a "you have not looked yet" mark. */
  clearUnread(dock: DockId, tab: DockTab): void

  setCenterView(view: CenterView): void

  /**
   * Drops the tabs whose instance belonged to the session being left (§5.3).
   * Single-instance session-scoped panels keep their slot and rebuild against
   * the new session; a per-instance one has nothing left to show.
   */
  pruneSessionScopedTabs(): void

  /** Closes the active tab of the dock that owns focus; the `⌘W` target. */
  closeActiveTab(dock: DockId): void
}

export type LayoutStore = StoreApi<LayoutStoreState & LayoutActions>

/** Clamps a dock size to its configured bounds against the current viewport. */
function clampDockSize(dock: DockId, size: number, viewportWidth: number, viewportHeight: number): number {
  const config = DOCK_CONFIG[dock]
  const extent = config.axis === 'width' ? viewportWidth : viewportHeight
  const max = Math.max(config.minSize, Math.round(extent * config.maxFraction))
  return Math.min(max, Math.max(config.minSize, size))
}

/**
 * Builds the layout store.
 * @param registry - the panel registry, consulted for instance keys and reviving persisted tabs.
 * @returns a vanilla store the presentation layer subscribes to.
 */
export function createLayoutStore(registry: PanelRegistry): LayoutStore {
  const store = createStore<LayoutStoreState & LayoutActions>()(immer((set, get) => ({
    ...createLayoutState(),
    workspaceId: undefined,
    viewportWidth: 1440,
    viewportHeight: 900,
    tier: 'wide',
    rightOverlay: false,
    sidebarDrawer: false,
    sidebarDrawerOpen: false,
    autoClosed: { right: false, sidebar: false, bottom: false },
    unread: {},
    lastActiveDock: 'bottom',
    centerView: 'conversation',

    attachWorkspace(workspaceId) {
      if (get().workspaceId === workspaceId) return
      const loaded = loadLayout(workspaceId, panelId => {
        const descriptor = registry.get(panelId)
        return descriptor !== undefined && descriptor.scope === 'workspace'
      })
      set(state => {
        state.workspaceId = workspaceId
        state.sidebar = loaded.sidebar
        state.right = loaded.right
        state.bottom = loaded.bottom
        state.autoClosed = { right: false, sidebar: false, bottom: false }
        state.unread = {}
      })
      applyViewport(set, get, persist)
    },

    setViewport(width, height) {
      set(state => {
        state.viewportWidth = width
        state.viewportHeight = height
      })
      applyViewport(set, get, persist)
    },

    setSidebarWidth(width) {
      set(state => {
        state.sidebar = width <= 0 ? 0 : Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
        state.autoClosed.sidebar = false
      })
      persist(get())
    },

    toggleSidebar() {
      const state = get()
      if (state.sidebarDrawer) {
        set(draft => { draft.sidebarDrawerOpen = !draft.sidebarDrawerOpen })
        return
      }
      set(draft => {
        draft.sidebar = draft.sidebar > 0 ? 0 : (draft.tier === 'narrow' ? SIDEBAR_NARROW_WIDTH : SIDEBAR_DEFAULT_WIDTH)
        draft.autoClosed.sidebar = false
      })
      persist(get())
    },

    setSidebarDrawerOpen(open) {
      set(state => { state.sidebarDrawerOpen = open })
    },

    setDockSize(dock, size) {
      const { viewportWidth, viewportHeight } = get()
      set(state => {
        const target = state[dock]
        target.size = clampDockSize(dock, size, viewportWidth, viewportHeight)
        target.restoreSize = target.size
        state.autoClosed[dock] = false
      })
      persist(get())
    },

    resetDockSize(dock) {
      const { viewportWidth, viewportHeight } = get()
      set(state => {
        const target = state[dock]
        const defaultSize = clampDockSize(dock, DOCK_CONFIG[dock].defaultSize, viewportWidth, viewportHeight)
        // Double-clicking the splitter toggles between the default size and collapsed.
        const collapsed = target.size === 0 || target.size === defaultSize
        target.size = collapsed && target.size === defaultSize ? 0 : defaultSize
        if (target.size > 0) target.restoreSize = target.size
      })
      persist(get())
    },

    toggleDock(dock) {
      const state = get()
      if (state[dock].size > 0) {
        get().closeDock(dock)
        return
      }
      openDock(set, get, dock)
      // §8: below 740px only one dock may be visible at a time.
      if (get().tier === 'compact') {
        const other: DockId = dock === 'right' ? 'bottom' : 'right'
        if (get()[other].size > 0) set(draft => { draft[other].size = 0 })
      }
      set(draft => { draft.lastActiveDock = dock })
      persist(get())
    },

    closeDock(dock) {
      set(state => {
        const target = state[dock]
        if (target.size > 0) target.restoreSize = target.size
        target.size = 0
        state.autoClosed[dock] = false
      })
      persist(get())
    },

    openPanel(panelId, options = {}) {
      const descriptor = registry.get(panelId)
      if (descriptor === undefined) return
      const target = options.target ?? descriptor.mintInstance?.()
      const instanceKey = registry.instanceKey(panelId, target)
      const focus = options.focus ?? true

      // Already open somewhere? Focus it only when the caller asked to.
      // Agent-terminal discovery uses focus:false so a live PTY does not steal
      // the tab the user is looking at.
      for (const dock of ['right', 'bottom'] as const) {
        const index = get()[dock].tabs.findIndex(tab => tab.panelId === panelId && tab.instanceKey === instanceKey)
        if (index === -1) continue
        if (!focus) return
        set(state => {
          state[dock].activeIndex = index
          delete state.unread[tabKey(dock, { panelId, instanceKey })]
          if (state[dock].size === 0) state[dock].size = state[dock].restoreSize
        })
        set(draft => { draft.lastActiveDock = dock })
        enforceSingleDock(set, get, dock)
        persist(get())
        return
      }

      const dock = options.dock ?? descriptor.preferredDock
      set(state => {
        const target = state[dock]
        const tab = { panelId, instanceKey }
        target.tabs.push(tab)
        if (focus) {
          target.activeIndex = target.tabs.length - 1
          if (target.size === 0) target.size = target.restoreSize
        }
        else if (target.tabs.length > 1) {
          state.unread[tabKey(dock, tab)] = true
        }
        state.autoClosed[dock] = false
        state.lastActiveDock = dock
      })
      enforceSingleDock(set, get, dock)
      persist(get())
    },

    activateTab(dock, index) {
      set(state => {
        const target = state[dock]
        if (index < 0 || index >= target.tabs.length) return
        target.activeIndex = index
        const tab = target.tabs[index]
        if (tab !== undefined) delete state.unread[tabKey(dock, tab)]
        state.lastActiveDock = dock
      })
      persist(get())
    },

    closeTab(dock, index) {
      const existing = get()[dock].tabs[index]
      if (existing === undefined) return
      if (
        existing.panelId === 'preview'
        && existing.instanceKey !== null
        && !confirmClosePreview(existing.instanceKey)
      ) return
      set(state => {
        const target = state[dock]
        const tab = target.tabs[index]
        if (tab === undefined) return
        delete state.unread[tabKey(dock, tab)]
        target.tabs.splice(index, 1)
        target.activeIndex = Math.min(target.activeIndex, Math.max(0, target.tabs.length - 1))
        // An empty dock shows its empty state rather than vanishing: the user
        // closed a tab, not the dock.
      })
      persist(get())
    },

    closeActiveTab(dock) {
      const target = get()[dock]
      if (target.tabs.length === 0) return
      get().closeTab(dock, target.activeIndex)
    },

    moveTab(from, to) {
      set(state => {
        const source = state[from.dock]
        const tab = source.tabs[from.index]
        if (tab === undefined) return
        const destination = state[to.dock]
        const duplicate = from.dock !== to.dock
          && destination.tabs.some(other => other.panelId === tab.panelId && other.instanceKey === tab.instanceKey)
        source.tabs.splice(from.index, 1)
        if (duplicate) {
          source.activeIndex = Math.min(source.activeIndex, Math.max(0, source.tabs.length - 1))
          return
        }
        const insertAt = Math.min(Math.max(0, to.index), destination.tabs.length)
        destination.tabs.splice(insertAt, 0, tab)
        destination.activeIndex = insertAt
        source.activeIndex = Math.min(source.activeIndex, Math.max(0, source.tabs.length - 1))
        if (destination.size === 0) destination.size = destination.restoreSize
        state.lastActiveDock = to.dock
      })
      enforceSingleDock(set, get, to.dock)
      persist(get())
    },

    markUnread(dock, tab) {
      const target = get()[dock]
      const activeTab = target.tabs[target.activeIndex]
      const isActive = activeTab?.panelId === tab.panelId && activeTab.instanceKey === tab.instanceKey
      if (isActive && target.size > 0) return
      set(state => { state.unread[tabKey(dock, tab)] = true })
    },

    clearUnread(dock, tab) {
      set(state => { delete state.unread[tabKey(dock, tab)] })
    },

    setCenterView(view) {
      set(state => {
        state.centerView = view
        if (state.sidebarDrawer) state.sidebarDrawerOpen = false
      })
    },

    pruneSessionScopedTabs() {
      set(state => {
        for (const dock of ['right', 'bottom'] as const) {
          const target = state[dock]
          const kept = target.tabs.filter(tab => !isSessionInstance(registry, tab))
          if (kept.length === target.tabs.length) continue
          target.tabs = kept
          target.activeIndex = Math.min(target.activeIndex, Math.max(0, kept.length - 1))
        }
        state.unread = {}
      })
      persist(get())
    },
  })))

  /** Only workspace-scoped tabs round-trip (RFC §5.3); session panels are opt-in each visit. */
  function persist(state: LayoutStoreState): void {
    const durable = (dockState: DockState): DockState => ({
      ...dockState,
      tabs: dockState.tabs.filter(tab => isWorkspacePanel(registry, tab)),
    })
    saveLayout(state.workspaceId, {
      sidebar: state.sidebar,
      right: durable(state.right),
      bottom: durable(state.bottom),
    })
  }

  return store
}

/** A multi-instance panel whose lifetime is one session; its key names that session's content. */
function isSessionInstance(registry: PanelRegistry, tab: DockTab): boolean {
  const descriptor = registry.get(tab.panelId)
  return descriptor?.scope === 'session' && descriptor.multiInstance
}

function isWorkspacePanel(registry: PanelRegistry, tab: DockTab): boolean {
  return registry.get(tab.panelId)?.scope === 'workspace'
}

type SetState = (updater: (state: LayoutStoreState & LayoutActions) => void) => void
type GetState = () => LayoutStoreState & LayoutActions
type Persist = (state: LayoutStoreState) => void

/** Expands a dock, seeding its default panel the first time it has nothing to show. */
function openDock(set: SetState, get: GetState, dock: DockId): void {
  const config = DOCK_CONFIG[dock]
  const { viewportWidth, viewportHeight, tier } = get()
  const restore = get()[dock].restoreSize === 0 ? config.defaultSize : get()[dock].restoreSize
  const desired = tier === 'compact' && dock === 'bottom'
    ? Math.round(viewportHeight * COMPACT_BOTTOM_FRACTION)
    : restore
  set(state => {
    const target = state[dock]
    target.size = clampDockSize(dock, desired, viewportWidth, viewportHeight)
    state.autoClosed[dock] = false
  })
  if (get()[dock].tabs.length === 0) {
    // The seed is data, not a special case: a build where the default panel is
    // not registered simply opens to the empty state and its panel picker.
    const seedId = dock === 'bottom' && !getDockPrefs().bottomAutoTerminal
      ? undefined
      : config.defaultPanelId
    if (seedId !== undefined) get().openPanel(seedId, { dock, focus: false })
  }
}

/** §8: below 740px the two docks are mutually exclusive. */
function enforceSingleDock(set: SetState, get: GetState, keep: DockId): void {
  if (get().tier !== 'compact') return
  const other: DockId = keep === 'right' ? 'bottom' : 'right'
  if (get()[other].size === 0) return
  set(state => {
    state[other].restoreSize = state[other].size
    state[other].size = 0
  })
}

/**
 * Applies the fixed concession chain (§8): the right dock shrinks, then closes,
 * then the sidebar collapses, then the bottom dock shrinks. Anything the chain
 * closed is remembered and restored when the viewport grows back.
 */
function applyViewport(set: SetState, get: GetState, persist: Persist): void {
  const before = get()
  const tier = tierOf(before.viewportWidth)
  const rightOverlay = tier === 'narrow' || tier === 'compact'
  const sidebarDrawer = tier === 'compact'

  set(state => {
    state.tier = tier
    state.rightOverlay = rightOverlay
    state.sidebarDrawer = sidebarDrawer
    if (!sidebarDrawer) state.sidebarDrawerOpen = false

    // Restore first: a widening viewport must undo the chain in reverse.
    if (state.autoClosed.sidebar && !sidebarDrawer) {
      state.sidebar = tier === 'narrow' ? SIDEBAR_NARROW_WIDTH : SIDEBAR_DEFAULT_WIDTH
      state.autoClosed.sidebar = false
    }
    if (state.autoClosed.right) {
      state.right.size = state.right.restoreSize
      state.autoClosed.right = false
    }

    // §8: ≤980px the sidebar column is 220px unless the user has chosen another width.
    if (!sidebarDrawer && state.sidebar > 0) {
      if (tier === 'narrow' && state.sidebar === SIDEBAR_DEFAULT_WIDTH) {
        state.sidebar = SIDEBAR_NARROW_WIDTH
      }
      if (tier !== 'narrow' && state.sidebar === SIDEBAR_NARROW_WIDTH) {
        state.sidebar = SIDEBAR_DEFAULT_WIDTH
      }
    }

    const height = state.viewportHeight
    state.right.size = state.right.size === 0 ? 0 : clampDockSize('right', state.right.size, state.viewportWidth, height)
    state.bottom.size = state.bottom.size === 0 ? 0 : clampDockSize('bottom', state.bottom.size, state.viewportWidth, height)

    if (tier === 'compact' && before.tier !== 'compact' && state.bottom.size > 0) {
      state.bottom.size = clampDockSize(
        'bottom',
        Math.round(height * COMPACT_BOTTOM_FRACTION),
        state.viewportWidth,
        height,
      )
    }

    // An overlaying right dock takes no column width, so only the in-flow docks
    // participate in the horizontal budget.
    const rightInFlow = rightOverlay ? 0 : state.right.size
    let deficit = state.viewportWidth - (sidebarDrawer ? 0 : state.sidebar) - rightInFlow - CONVERSATION_MIN_WIDTH

    if (deficit < 0 && !rightOverlay && state.right.size > DOCK_CONFIG.right.minSize) {
      const shrunk = Math.max(DOCK_CONFIG.right.minSize, state.right.size + deficit)
      deficit += state.right.size - shrunk
      state.right.size = shrunk
    }
    if (deficit < 0 && !rightOverlay && state.right.size > 0) {
      state.right.restoreSize = state.right.size
      deficit += state.right.size
      state.right.size = 0
      state.autoClosed.right = true
    }
    if (deficit < 0 && !sidebarDrawer && state.sidebar > 0) {
      deficit += state.sidebar
      state.sidebar = 0
      state.autoClosed.sidebar = true
    }

    // The bottom dock's budget is vertical: the conversation must keep room for
    // its header and Composer whatever the terminal's height.
    const conversationFloor = 260
    if (state.bottom.size > 0 && height - state.bottom.size < conversationFloor) {
      state.bottom.size = Math.max(DOCK_CONFIG.bottom.minSize, height - conversationFloor)
    }

    if (tier === 'compact' && state.right.size > 0 && state.bottom.size > 0) {
      const drop: DockId = state.lastActiveDock === 'right' ? 'bottom' : 'right'
      state[drop].restoreSize = state[drop].size
      state[drop].size = 0
    }
  })

  const after = get()
  const dockState = (state: DockState) => `${String(state.size)}/${String(state.tabs.length)}`
  const changed = before.sidebar !== after.sidebar
    || dockState(before.right) !== dockState(after.right)
    || dockState(before.bottom) !== dockState(after.bottom)
  if (changed) persist(after)
}
