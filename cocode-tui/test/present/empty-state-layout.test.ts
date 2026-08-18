import { describe, expect, it } from 'vitest'
import { emptyStateLayout } from '../../src/present/empty-state-layout.ts'

describe('empty state layout', () => {
  it('chooses the full Cocode wordmark for a normal chat viewport', () => {
    expect(emptyStateLayout(24)).toEqual({ logoSize: 'large', showTitle: true, showHint: true })
  })

  it('steps down without hiding the wordmark on short viewports', () => {
    expect(emptyStateLayout(15)).toEqual({ logoSize: 'medium', showTitle: true, showHint: true })
    expect(emptyStateLayout(9)).toEqual({ logoSize: 'small', showTitle: true, showHint: false })
    expect(emptyStateLayout(8)).toEqual({ logoSize: 'inline', showTitle: false, showHint: false })
  })

  it('uses the inline mark when the wordmark cannot fit', () => {
    expect(emptyStateLayout(5)).toEqual({ logoSize: 'inline', showTitle: false, showHint: false })
  })

  it('scales down for narrow terminals', () => {
    expect(emptyStateLayout(15, 80)).toEqual({
      logoSize: 'medium',
      showTitle: true,
      showHint: true,
    })
    expect(emptyStateLayout(15, 79)).toEqual({
      logoSize: 'inline',
      showTitle: false,
      showHint: false,
    })
  })
})
