import { describe, expect, it } from 'vitest'
import { emptyStateLayout } from '../../src/present/empty-state-layout.ts'

describe('empty state layout', () => {
  it('chooses a full whale for a normal chat viewport', () => {
    expect(emptyStateLayout(24)).toEqual({ logoSize: 'large', showTitle: true, showHint: true })
  })

  it('steps down without hiding the whale on short viewports', () => {
    expect(emptyStateLayout(15)).toEqual({ logoSize: 'medium', showTitle: true, showHint: true })
    expect(emptyStateLayout(9)).toEqual({ logoSize: 'small', showTitle: true, showHint: false })
    expect(emptyStateLayout(8)).toEqual({ logoSize: 'inline', showTitle: false, showHint: false })
  })

  it('uses the inline mark when the horizontal composition cannot fit', () => {
    expect(emptyStateLayout(5)).toEqual({ logoSize: 'inline', showTitle: false, showHint: false })
  })

  it('scales down for narrow terminals', () => {
    expect(emptyStateLayout(15, 73)).toEqual({
      logoSize: 'medium',
      showTitle: true,
      showHint: true,
    })
    expect(emptyStateLayout(15, 72)).toEqual({
      logoSize: 'inline',
      showTitle: false,
      showHint: false,
    })
  })
})
