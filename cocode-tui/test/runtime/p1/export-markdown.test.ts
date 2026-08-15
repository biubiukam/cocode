import { describe, expect, it } from 'vitest'
import { nodesToMarkdown } from '../../../src/runtime/export-markdown.ts'

describe('nodesToMarkdown', () => {
  it('exports user, assistant, and tool nodes', () => {
    const markdown = nodesToMarkdown([
      { kind: 'user', id: 'u', seq: 1, time: 1, text: 'inspect' },
      {
        kind: 'assistant',
        id: 'a',
        seq: 2,
        time: 2,
        turn: 1,
        step: 0,
        text: 'Done',
        reasoning: 'hidden',
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't',
        seq: 3,
        time: 3,
        callId: 'c',
        name: 'bash',
        args: '{"command":"ls"}',
        status: 'success',
        result: '```\nlarge',
      },
    ])
    expect(markdown).toContain('## User\n\ninspect')
    expect(markdown).toContain('## Assistant\n\nDone')
    expect(markdown).toContain('### Tool: bash (success)')
    expect(markdown).toContain('````\n```\nlarge\n````')
    expect(markdown).not.toContain('hidden')
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('can include reasoning explicitly and ignores notices', () => {
    const markdown = nodesToMarkdown(
      [
        {
          kind: 'assistant',
          id: 'a',
          seq: 1,
          time: 1,
          turn: 1,
          step: 0,
          text: 'answer',
          reasoning: 'reason',
          streaming: false,
        },
        { kind: 'notice', id: 'n', seq: 2, time: 2, tone: 'info', message: 'status' },
      ],
      { includeReasoning: true },
    )
    expect(markdown).toContain('> Reasoning\n\nreason')
    expect(markdown).not.toContain('status')
  })
})
