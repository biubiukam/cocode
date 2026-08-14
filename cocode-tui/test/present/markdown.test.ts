import { describe, expect, it } from 'vitest'
import {
  parseMarkdownBlocks,
  splitStreamingMarkdown,
} from '../../src/present/components/Markdown.tsx'

describe('markdown presentation', () => {
  it('projects common markdown blocks without losing plain text', () => {
    expect(parseMarkdownBlocks('# Title\n\n**answer**\n\n- one\n- two')).toEqual([
      { kind: 'heading', depth: 1, text: 'Title' },
      { kind: 'paragraph', text: '**answer**' },
      { kind: 'list', ordered: false, items: ['one', 'two'] },
    ])
  })

  it('keeps the growing final block unstable while freezing complete blocks', () => {
    const first = splitStreamingMarkdown('First paragraph.\n\nSecond', '')
    expect(first.stablePrefix).toBe('First paragraph.\n\n')
    expect(first.unstableSuffix).toBe('Second')
    const next = splitStreamingMarkdown('First paragraph.\n\nSecond line.', first.stablePrefix)
    expect(next.stablePrefix).toBe(first.stablePrefix)
    expect(next.unstableSuffix).toBe('Second line.')
  })
})
