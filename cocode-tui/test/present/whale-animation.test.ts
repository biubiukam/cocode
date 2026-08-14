import { describe, expect, it } from 'vitest'
import {
  INLINE_WHALE_ANIMATION,
  LARGE_WHALE_ANIMATION,
  MEDIUM_WHALE_ANIMATION,
  SMALL_WHALE_ANIMATION,
} from '../../src/present/whale-animation.ts'

describe('whale animation', () => {
  it('keeps every filled whale frame at a stable size', () => {
    for (const [animation, rows, width] of [
      [LARGE_WHALE_ANIMATION, 13, 68],
      [MEDIUM_WHALE_ANIMATION, 11, 50],
      [SMALL_WHALE_ANIMATION, 7, 34],
    ] as const) {
      const rowCounts = animation.frames.map((frame) => frame.split('\n').length)
      const widths = animation.frames.flatMap((frame) =>
        frame.split('\n').map((line) => line.length),
      )

      expect(new Set(rowCounts)).toEqual(new Set([rows]))
      expect(new Set(widths)).toEqual(new Set([width]))
    }
  })

  it('keeps the silhouette fixed while binary texture and spout move', () => {
    const silhouettes = LARGE_WHALE_ANIMATION.frames.map((frame) =>
      frame.split('\n').slice(LARGE_WHALE_ANIMATION.accentRows).join('\n').replace(/[01]/g, '#'),
    )

    expect(LARGE_WHALE_ANIMATION.frames.every((frame) => frame.includes('cocode'))).toBe(true)
    expect(
      LARGE_WHALE_ANIMATION.frames.every((frame) => (frame.match(/[01]/g) ?? []).length > 300),
    ).toBe(true)
    expect(new Set(silhouettes).size).toBe(1)
    expect(new Set(LARGE_WHALE_ANIMATION.frames).size).toBeGreaterThan(4)
  })

  it('keeps the low-height inline animation on one row', () => {
    expect(INLINE_WHALE_ANIMATION.frames.every((frame) => !frame.includes('\n'))).toBe(true)
    expect(new Set(INLINE_WHALE_ANIMATION.frames.map((frame) => frame.length)).size).toBe(1)
  })
})
