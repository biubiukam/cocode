import { describe, expect, it } from 'vitest'
import { scrollMetrics } from '../../src/present/components/ScrollablePanel.tsx'

describe('scrollable panel metrics', () => {
  it('uses the full height when content fits', () => {
    expect(scrollMetrics(8, 6, 3)).toEqual({
      offset: 0,
      maxOffset: 0,
      viewportRows: 8,
      overflowing: false,
    })
  })

  it('reserves stable overflow indicators and clamps the offset', () => {
    expect(scrollMetrics(8, 12, 99)).toEqual({
      offset: 6,
      maxOffset: 6,
      viewportRows: 6,
      overflowing: true,
    })
  })

  it('keeps very small containers usable without indicator rows', () => {
    expect(scrollMetrics(2, 5, 1)).toEqual({
      offset: 1,
      maxOffset: 3,
      viewportRows: 2,
      overflowing: true,
    })
  })
})
