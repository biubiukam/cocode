import { describe, expect, it } from 'vitest'
import { filterSearchItems } from '../../src/present/search.ts'

describe('search helpers', () => {
  it('matches case-insensitively across the supplied search text', () => {
    const items = [
      { name: 'status', summary: 'Show session status' },
      { name: 'theme', summary: 'Change colors' },
    ]
    expect(filterSearchItems(items, 'COLORS', (item) => `${item.name} ${item.summary}`)).toEqual([
      items[1],
    ])
  })

  it('preserves the original order for an empty query', () => {
    const items = ['first', 'second']
    expect(filterSearchItems(items, '  ', (item) => item)).toBe(items)
  })
})
