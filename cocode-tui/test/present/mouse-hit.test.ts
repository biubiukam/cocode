import { describe, expect, it } from 'vitest'
import {
  approvalActionAtRow,
  actionMenuItemIndexAtRow,
  listItemIndexAtRow,
  composerModelHit,
  popupContains,
  questionCustomRow,
  questionOptionIndexAtRow,
} from '../../src/present/mouse-hit.ts'

describe('mouse hit zones', () => {
  it('maps the visible composer model label to its clickable range', () => {
    expect(composerModelHit({
      row: 24,
      x: 31,
      titleRow: 24,
      modelStartColumn: 31,
      modelEndColumn: 33,
    })).toBe(true)
    expect(composerModelHit({
      row: 24,
      x: 33,
      titleRow: 24,
      modelStartColumn: 31,
      modelEndColumn: 33,
    })).toBe(false)
    expect(composerModelHit({
      row: 23,
      x: 31,
      titleRow: 24,
      modelStartColumn: 31,
      modelEndColumn: 33,
    })).toBe(false)
    expect(composerModelHit({
      row: 24,
      x: 31,
      titleRow: 24,
    })).toBe(false)
  })
  it('maps clicks to the currently visible menu window', () => {
    expect(actionMenuItemIndexAtRow({
      row: 14,
      menuStartRow: 10,
      itemCount: 4,
      selectedIndex: 0,
      maxRows: 8,
    })).toBe(1)
    expect(actionMenuItemIndexAtRow({
      row: 20,
      menuStartRow: 10,
      itemCount: 4,
      selectedIndex: 0,
      maxRows: 8,
    })).toBeUndefined()
    expect(actionMenuItemIndexAtRow({
      row: 15,
      menuStartRow: 10,
      itemCount: 4,
      selectedIndex: 0,
      maxRows: 9,
      query: true,
    })).toBe(1)
  })

  it('keeps pointer hits inside the inline popup region', () => {
    const bounds = { startRow: 10, startColumn: 1, rows: 8, columns: 80 }
    expect(popupContains(bounds, 1, 10)).toBe(true)
    expect(popupContains(bounds, 80, 17)).toBe(true)
    expect(popupContains(bounds, 81, 17)).toBe(false)
    expect(popupContains(bounds, 20, 18)).toBe(false)
  })

  it('accounts for a scrolled list window and its indicator row', () => {
    expect(listItemIndexAtRow({
      row: 18,
      itemStartRow: 16,
      itemCount: 12,
      selectedIndex: 6,
      windowSize: 4,
    })).toBe(6)
    expect(listItemIndexAtRow({
      row: 15,
      itemStartRow: 16,
      itemCount: 12,
      selectedIndex: 6,
      windowSize: 4,
    })).toBeUndefined()
  })

  it('maps question option labels and descriptions to the same option', () => {
    const optionHasDescription = [false, true, false]
    expect(questionOptionIndexAtRow({
      row: 12,
      firstOptionRow: 12,
      optionHasDescription,
    })).toBe(0)
    expect(questionOptionIndexAtRow({
      row: 14,
      firstOptionRow: 12,
      optionHasDescription,
    })).toBe(1)
    expect(questionOptionIndexAtRow({
      row: 15,
      firstOptionRow: 12,
      optionHasDescription,
    })).toBe(2)
    expect(questionCustomRow({ firstOptionRow: 12, optionHasDescription })).toBe(16)
  })

  it('maps approval action rows without making the details clickable', () => {
    expect(approvalActionAtRow(18, 10)).toBe('allowed-once')
    expect(approvalActionAtRow(19, 10)).toBe('allowed-for-turn')
    expect(approvalActionAtRow(20, 10)).toBe('rejected')
    expect(approvalActionAtRow(17, 10)).toBeUndefined()
  })
})
