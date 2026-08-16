/**
 * Spacing scale.
 *
 * One terminal cell is this UI's 4px. The design system's spacing tokens have
 * no sub-cell resolution here, so every offset is a whole number of cells or
 * rows and carries a name, which turns "this component indents one more than
 * its neighbour" into a reviewable deviation rather than an inline literal.
 */

/** Rail column, drawn to the left of every message and tool row. */
export const RAIL = 1

/** Gap between the rail and body text. */
export const BODY_INDENT = 1

/**
 * Total chrome left of any message body. Tool rows reuse it so an assistant
 * reply and the tools it called line up on one continuous rail.
 */
export const MESSAGE_CHROME = RAIL + BODY_INDENT

/** Panel interior padding. */
export const PANEL_PADDING_X = 1

/**
 * Every framed panel shares one border. The design system sets radius to 0, and
 * a terminal's round corners are the one shape choice that reads as decoration.
 */
export const PANEL_BORDER = 'single' as const

/** Blank row separating blocks. */
export const BLOCK_GAP = 1

export function messageContentColumns(maxColumns: number | undefined): number | undefined {
  return maxColumns === undefined ? undefined : Math.max(1, maxColumns - MESSAGE_CHROME)
}
