import { describe, expect, it } from 'vitest'
import {
  filterSlashItems,
  moveSlashSelection,
  selectedSlashItem,
  slashCommandCompletion,
  slashCommandLabel,
  type SlashMenuItem,
} from '../../src/present/components/SlashMenu.tsx'

const items: SlashMenuItem[] = [
  { name: 'help', summary: 'Help' },
  { name: 'status', summary: 'Status' },
  { name: 'theme', summary: 'Theme' },
]

describe('slash menu helpers', () => {
  it('filters by command name prefix and closes after whitespace', () => {
    expect(filterSlashItems(items, '/').map((item) => item.name)).toEqual([
      'help',
      'status',
      'theme',
    ])
    expect(filterSlashItems(items, '/st').map((item) => item.name)).toEqual(['status'])
    expect(filterSlashItems(items, '/the').map((item) => item.name)).toEqual(['theme'])
    expect(filterSlashItems([{ name: 'inspect', summary: 'Show status details' }], '/sta')).toEqual([])
    expect(filterSlashItems(items, '/theme dark')).toEqual([])
  })

  it('wraps selection and returns the selected item', () => {
    expect(moveSlashSelection(0, -1, items.length)).toBe(2)
    expect(moveSlashSelection(2, 1, items.length)).toBe(0)
    expect(moveSlashSelection(Number.NaN, Number.NaN, items.length)).toBe(0)
    expect(selectedSlashItem(items, 1)?.name).toBe('status')
  })

  it('shows an input hint for runtime commands that need arguments', () => {
    expect(slashCommandLabel({ name: 'permission', summary: 'Switch preset', input: { hint: '<preset>' } })).toBe(
      '/permission <preset>',
    )
    expect(slashCommandLabel(items[0]!)).toBe('/help')
    expect(slashCommandCompletion(items[0]!)).toBe('/help')
    expect(slashCommandCompletion({ name: 'permission', summary: 'Switch preset', input: { hint: '<preset>' } })).toBe(
      '/permission ',
    )
  })
})
