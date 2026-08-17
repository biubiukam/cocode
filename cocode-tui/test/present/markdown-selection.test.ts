import { describe, expect, it } from 'vitest'
import { layoutMarkdownSource } from '../../src/present/markdown-layout.ts'

const LIST_MARKDOWN = [
  'Here are some things I can assist with:',
  '',
  '- 🔍 Explore the codebase',
  '- 📝 Review code or changes',
].join('\n')

describe('markdown selection layout', () => {
  it('lays out list items without the blank line before them', () => {
    const lines = layoutMarkdownSource(LIST_MARKDOWN, 80)
    const last = lines.at(-1)

    expect(lines).toHaveLength(3)
    expect(LIST_MARKDOWN.slice(lines[0]!.start, lines[0]!.end)).toBe(
      'Here are some things I can assist with:',
    )
    expect(LIST_MARKDOWN.slice(lines[1]!.start, lines[1]!.end)).toContain('Explore')
    expect(last).toBeDefined()
    expect(LIST_MARKDOWN.slice(last!.start, last!.end)).toContain('changes')
    expect(last!.start).toBe(LIST_MARKDOWN.indexOf('📝 Review'))
  })
})
