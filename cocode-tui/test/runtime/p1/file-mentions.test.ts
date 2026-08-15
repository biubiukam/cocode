import { describe, expect, it } from 'vitest'
import { findFileMentionAtCursor, formatFileMention } from '../../../src/runtime/file-mentions.ts'

describe('file mentions', () => {
  it('finds a mention at any cursor position after whitespace', () => {
    expect(findFileMentionAtCursor('review @src/mai', 15)).toEqual({
      start: 7,
      end: 15,
      query: 'src/mai',
    })
    expect(findFileMentionAtCursor('email me@team', 13)).toBeUndefined()
  })

  it('supports quoted paths when a selected path contains spaces', () => {
    expect(formatFileMention('docs/my notes.md')).toBe('@"docs/my notes.md"')
    expect(findFileMentionAtCursor('read @"docs/my', 14)).toMatchObject({
      start: 5,
      query: 'docs/my',
    })
    expect(findFileMentionAtCursor('read @"docs/my notes', 20)).toMatchObject({
      start: 5,
      query: 'docs/my notes',
    })
  })
})
