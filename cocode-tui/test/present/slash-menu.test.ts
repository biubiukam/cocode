import { describe, expect, it } from 'vitest'
import {
  filterSlashItems,
  moveSlashSelection,
  selectedSlashItem,
  type SlashMenuItem,
} from '../../src/present/components/SlashMenu.tsx'

const items: SlashMenuItem[] = [
  { name: 'help', summary: 'Help' },
  { name: 'status', summary: 'Status' },
  { name: 'theme', summary: 'Theme' },
]

describe('slash menu helpers', () => {
  it('filters by command name or summary and closes after whitespace', () => {
    expect(filterSlashItems(items, '/').map((item) => item.name)).toEqual([
      'help',
      'status',
      'theme',
    ])
    expect(filterSlashItems(items, '/st').map((item) => item.name)).toEqual(['status'])
    expect(filterSlashItems(items, '/the').map((item) => item.name)).toEqual(['theme'])
    expect(filterSlashItems(items, '/theme dark')).toEqual([])
  })

  it('wraps selection and returns the selected item', () => {
    expect(moveSlashSelection(0, -1, items.length)).toBe(2)
    expect(moveSlashSelection(2, 1, items.length)).toBe(0)
    expect(moveSlashSelection(Number.NaN, Number.NaN, items.length)).toBe(0)
    expect(selectedSlashItem(items, 1)?.name).toBe('status')
  })
})
