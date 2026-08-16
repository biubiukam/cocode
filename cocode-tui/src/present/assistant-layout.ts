/**
 * Assistant message spacing contract.
 *
 * Crush keeps the assistant body two cells from the message track. The TUI
 * owns that offset as one root cell plus one body cell so the heading and
 * body remain visually related without adding a second message border.
 */
export const ASSISTANT_ROOT_PADDING = 1
export const ASSISTANT_BODY_PADDING = 1
export const ASSISTANT_CONTENT_CHROME =
  ASSISTANT_ROOT_PADDING + ASSISTANT_BODY_PADDING

export function assistantContentColumns(maxColumns: number | undefined): number | undefined {
  return maxColumns === undefined
    ? undefined
    : Math.max(1, maxColumns - ASSISTANT_CONTENT_CHROME)
}
