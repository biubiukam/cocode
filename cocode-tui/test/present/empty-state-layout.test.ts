import { describe, expect, it } from 'vitest'
import { emptyStateLayout } from '../../src/present/empty-state-layout.ts'

describe('empty state layout', () => {
  it('chooses a full whale for a normal chat viewport', () => {
    expect(emptyStateLayout(24)).toEqual({ logoSize: 'large', showTitle: true, showHint: true })
  })

  it('steps down without hiding the whale on short viewports', () => {
    expect(emptyStateLayout(15)).toEqual({ logoSize: 'medium', showTitle: true, showHint: true })
    expect(emptyStateLayout(11)).toEqual({ logoSize: 'small', showTitle: true, showHint: false })
  })

  it('keeps a single-line mark when almost no rows are available', () => {
    expect(emptyStateLayout(5)).toEqual({ logoSize: 'inline', showTitle: false, showHint: false })
  })

  it('scales down for narrow terminals', () => {
    expect(emptyStateLayout(24, 64)).toEqual({
      logoSize: 'medium',
      showTitle: true,
      showHint: true,
    })
    expect(emptyStateLayout(24, 40)).toEqual({
      logoSize: 'inline',
      showTitle: false,
      showHint: false,
    })
  })
})
