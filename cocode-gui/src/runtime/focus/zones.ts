/**
 * Focus-zone ownership (RFC §13).
 *
 * With four parallel scroll regions, "close the current tab" and "move to the
 * next tab" only mean something relative to a zone. One tracker answers "where is
 * the user" for the whole shell, so no component has to guess.
 */

import { Observable } from '../notifier.ts'

export type FocusZone = 'sidebar' | 'conversation' | 'dock:right' | 'dock:bottom' | 'overlay'

const ZONE_ATTRIBUTE = 'data-focus-zone'

/** The attribute a region sets to claim focus ownership for its subtree. */
export const focusZoneAttribute = (zone: FocusZone): Record<string, string> => ({ [ZONE_ATTRIBUTE]: zone })

export class FocusTracker {
  /** The zone owning the focused element; the conversation is the resting default. */
  readonly zone = new Observable<FocusZone>('conversation')

  /**
   * Starts tracking focus inside a root.
   * @param root - the shell root element.
   * @returns the disposer that stops tracking.
   */
  attach(root: HTMLElement): () => void {
    const update = () => {
      const active = root.ownerDocument.activeElement
      if (!(active instanceof HTMLElement)) return
      const owner = active.closest(`[${ZONE_ATTRIBUTE}]`)
      const zone = owner?.getAttribute(ZONE_ATTRIBUTE)
      if (zone === null || zone === undefined) return
      this.zone.setNow(zone as FocusZone)
    }
    // `focusin` bubbles, so one listener covers every region.
    root.addEventListener('focusin', update)
    // A click that lands on a non-focusable surface still moves the user's attention.
    root.addEventListener('pointerdown', event => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const zone = target.closest(`[${ZONE_ATTRIBUTE}]`)?.getAttribute(ZONE_ATTRIBUTE)
      if (zone === null || zone === undefined) return
      this.zone.setNow(zone as FocusZone)
    }, true)
    return () => { root.removeEventListener('focusin', update) }
  }

  /** The dock owning focus, or `undefined` when focus is elsewhere. */
  activeDock(): 'right' | 'bottom' | undefined {
    const zone = this.zone.get()
    if (zone === 'dock:right') return 'right'
    if (zone === 'dock:bottom') return 'bottom'
    return undefined
  }
}
