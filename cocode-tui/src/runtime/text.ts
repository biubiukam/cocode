/**
 * Pull visible / reasoning text out of content-block arrays.
 */

export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block): block is { type: string; text: string } => {
      return isRecord(block) && block.type === 'text' && typeof block.text === 'string'
    })
    .map((block) => block.text)
    .join('')
}

/** Hide legacy vision-bridge evidence when the original display content is unavailable. */
export function blocksToUserDisplayText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block): block is { type: string; text: string } => {
      return isRecord(block) && block.type === 'text' && typeof block.text === 'string'
    })
    .map((block) => block.text.split('[Image evidence]', 1)[0])
    .join('')
}

export function reasoningToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block): block is { type: string; text: string } => {
      return isRecord(block) && block.type === 'reasoning' && typeof block.text === 'string'
    })
    .map((block) => block.text)
    .join('')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
