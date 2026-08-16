const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function graphemeBoundaries(text: string): number[] {
  return [
    0,
    ...Array.from(
      GRAPHEME_SEGMENTER.segment(text),
      (entry) => entry.index + entry.segment.length,
    ),
  ]
}

export function graphemeSegments(text: string): Array<{ index: number; segment: string }> {
  return Array.from(GRAPHEME_SEGMENTER.segment(text), (entry) => ({
    index: entry.index,
    segment: entry.segment,
  }))
}

export function normalizeGraphemeOffset(
  text: string,
  offset: number,
  bias: 'nearest' | 'previous' | 'next' = 'nearest',
): number {
  const boundaries = graphemeBoundaries(text)
  return normalizeOffset(boundaries, text.length, offset, bias)
}

export function moveByGraphemes(text: string, offset: number, delta: number): number {
  const boundaries = graphemeBoundaries(text)
  const cursor = normalizeOffset(boundaries, text.length, offset, 'nearest')
  if (!Number.isFinite(delta)) return cursor
  const index = Math.max(0, boundaries.indexOf(cursor))
  const target = Math.max(0, Math.min(index + Math.trunc(delta), boundaries.length - 1))
  return boundaries[target] ?? 0
}

function normalizeOffset(
  boundaries: readonly number[],
  textLength: number,
  offset: number,
  bias: 'nearest' | 'previous' | 'next',
): number {
  if (!Number.isFinite(offset)) return boundaries.at(-1) ?? 0
  const safeOffset = Math.max(0, Math.min(Math.trunc(offset), textLength))
  if (boundaries.includes(safeOffset)) return safeOffset
  const nextIndex = boundaries.findIndex((boundary) => boundary > safeOffset)
  const next = boundaries[nextIndex] ?? textLength
  const previous = boundaries[nextIndex - 1] ?? 0
  if (bias === 'previous') return previous
  if (bias === 'next') return next
  return safeOffset - previous < next - safeOffset ? previous : next
}
