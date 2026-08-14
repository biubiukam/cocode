/**
 * Dock and shell layout vocabulary (RFC §5.2, §5.3).
 *
 * The right dock and the bottom dock are one capability with two instances. All
 * of their difference is the table below: which axis they stretch on, their
 * bounds, and which panel they open first. Everything else — tabs, drag, empty
 * state, keyboard, persistence — is one implementation.
 */

import type { DockId } from '../panels/registry.ts'

export type { DockId }

/** One open tab. A panel instance is identified by `panelId` plus `instanceKey`. */
export type DockTab = {
  panelId: string
  /** Distinguishes instances of a multi-instance panel; `null` for singletons. */
  instanceKey: string | null
}

export type DockState = {
  /** Extent along the stretch axis, in px. `0` means closed. */
  size: number
  /** Extent to restore on reopen; never `0`. */
  restoreSize: number
  tabs: DockTab[]
  activeIndex: number
}

/** Which surface occupies the center column. Runtime key; missing key falls back to conversation. */
export type CenterView = string

export type LayoutState = {
  /** Sidebar width in px; `0` means collapsed. */
  sidebar: number
  right: DockState
  bottom: DockState
}

export type DockConfig = {
  axis: 'width' | 'height'
  defaultSize: number
  minSize: number
  /** Fraction of the viewport extent along the stretch axis. */
  maxFraction: number
  /** Panel opened the first time this dock is expanded with no tabs. */
  defaultPanelId: string
}

export const DOCK_CONFIG: Readonly<Record<DockId, DockConfig>> = {
  right: { axis: 'width', defaultSize: 360, minSize: 260, maxFraction: 0.5, defaultPanelId: 'files' },
  bottom: { axis: 'height', defaultSize: 280, minSize: 160, maxFraction: 0.6, defaultPanelId: 'terminal' },
}

export const SIDEBAR_DEFAULT_WIDTH = 256
export const SIDEBAR_NARROW_WIDTH = 220
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 420

/** The conversation column never shrinks past this; the Composer must stay usable. */
export const CONVERSATION_MIN_WIDTH = 420

/** Below 740px an open bottom dock occupies this fraction of the viewport height (§8). */
export const COMPACT_BOTTOM_FRACTION = 0.6

/** Breakpoints from §8, coarsest first. */
export type ViewportTier = 'wide' | 'medium' | 'narrow' | 'compact'

/**
 * Classifies a viewport width.
 * @param width - viewport width in CSS px.
 * @returns the tier that governs the concession chain.
 */
export function tierOf(width: number): ViewportTier {
  if (width <= 740) return 'compact'
  if (width <= 980) return 'narrow'
  if (width <= 1280) return 'medium'
  return 'wide'
}

/** The width class a panel sees; panels never learn their pixel size (§5.1). */
export type PanelSizeClass = 'compact' | 'regular'

/** Below this the panel must lay out in a single column. */
export const PANEL_COMPACT_MAX_WIDTH = 420

export function sizeClassOf(width: number): PanelSizeClass {
  return width <= PANEL_COMPACT_MAX_WIDTH ? 'compact' : 'regular'
}

export function createDockState(dock: DockId): DockState {
  const config = DOCK_CONFIG[dock]
  return { size: 0, restoreSize: config.defaultSize, tabs: [], activeIndex: 0 }
}

export function createLayoutState(): LayoutState {
  return { sidebar: SIDEBAR_DEFAULT_WIDTH, right: createDockState('right'), bottom: createDockState('bottom') }
}

/** Stable identity of one open tab, used to key non-persisted per-tab UI state. */
export function tabKey(dock: DockId, tab: DockTab): string {
  return `${dock}:${tab.panelId}:${tab.instanceKey ?? ''}`
}
