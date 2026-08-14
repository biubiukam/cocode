/**
 * What a panel author writes (RFC §5.1).
 *
 * A panel is one self-contained directory. It declares its lifetime and
 * multiplicity for the Dock, and a component for the shell. Registration splits
 * the object: the Dock-facing half goes into the React-free runtime registry, the
 * visual half stays here.
 *
 * `PanelProps` deliberately carries no dock position and no pixel size. A panel
 * that could tell where it lives would eventually assume it, and the two docks
 * would stop being one capability (§13).
 */

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DockId, PanelScope, PanelSizeClass } from '../runtime/index.ts'

export type PanelProps<T = void> = {
  /** The opened object; `undefined` for a panel with no target. */
  target: T
  /** Derived from the container's width — the only size fact a panel gets. */
  sizeClass: PanelSizeClass
  /** Whether this panel's tab is the active one in its dock. */
  active: boolean
  /** Marks the tab as having content the user has not seen yet (§5.5). */
  markUnread(): void
}

export type PanelDefinition<T = void> = {
  /** Globally unique; also the key in the persisted layout. */
  id: string
  /** Tab label; an instance may override it through `describe`. */
  title: string
  icon: LucideIcon
  scope: PanelScope
  multiInstance: boolean
  preferredDock: DockId
  /** Instance label, e.g. the previewed file name. */
  describe?(target: T): string
  /** Required for a multi-instance panel: how a target becomes a persistable key. */
  toKey?(target: T): string
  /** Required for a multi-instance panel: how a persisted key becomes a target. */
  fromKey?(key: string): T
  /**
   * When `open` is called without a target, mint a fresh instance instead of
   * reusing one. Used by Terminal so every open is a new PTY.
   */
  mintInstance?(): T
  render(props: PanelProps<T>): ReactNode
}

/**
 * The target-erased form the registry stores. Erasing a contravariant `render`
 * cannot be expressed as a subtype relation, so the registry performs one
 * explicit cast at its single construction site rather than spreading `any`
 * through every consumer.
 */
export type AnyPanelDefinition = {
  id: string
  title: string
  icon: LucideIcon
  scope: PanelScope
  multiInstance: boolean
  preferredDock: DockId
  describe?(target: unknown): string
  toKey?(target: unknown): string
  fromKey?(key: string): unknown
  mintInstance?(): unknown
  render(props: PanelProps<unknown>): ReactNode
}

/**
 * Declares a panel. The identity function exists purely so the target type is
 * inferred across `describe` / `toKey` / `render` in one object literal.
 * @param definition - the panel declaration.
 * @returns the same definition, typed.
 */
export function definePanel<T>(definition: PanelDefinition<T>): PanelDefinition<T> {
  return definition
}

/** Narrows the unknown view stored on the panel service. */
export function asPanelView(view: unknown): AnyPanelDefinition | undefined {
  if (view === null || typeof view !== 'object') return undefined
  if (!('id' in view) || !('render' in view) || !('title' in view)) return undefined
  return view as AnyPanelDefinition
}
