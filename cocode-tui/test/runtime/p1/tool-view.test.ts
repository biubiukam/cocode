import { describe, expect, it } from 'vitest'
import {
  extractPartialJsonStringArgument,
  inferToolView,
  toolViewDetail,
  truncatePlanProgress,
} from '../../../src/runtime/nodes/tool-view.ts'
import { parseDiffSummary } from '../../../src/runtime/diff-summary.ts'

describe('tool view projection', () => {
  it('projects read tools with a file path', () => {
    const view = inferToolView('fs.read', '{"path":"src/app.ts"}')
    expect(view).toEqual({ kind: 'read', path: 'src/app.ts' })
    expect(toolViewDetail(view)).toBe('read src/app.ts')
  })

  it('projects search, diff, and terminal tools without requiring wire views', () => {
    expect(inferToolView('search', '{"query":"TODO"}')).toEqual({
      kind: 'search',
      query: 'TODO',
    })
    expect(inferToolView('git.diff', '{"paths":["a.ts","b.ts"]}')).toEqual({
      kind: 'diff',
      paths: ['a.ts', 'b.ts'],
    })
    expect(inferToolView('terminal.exec', '{"command":"git status"}')).toEqual({
      kind: 'terminal',
      command: 'git status',
    })
  })

  it('keeps unknown tools generic and tolerates malformed args', () => {
    expect(inferToolView('weather', '{broken')).toBeUndefined()
    expect(inferToolView('fs.read', '{broken')).toEqual({ kind: 'read' })
  })

  it('leaves unparseable diff output available for the text fallback', () => {
    expect(parseDiffSummary('plain command output').files).toEqual([])
  })

  it('extracts a plan while the JSON tool argument is still incomplete', () => {
    expect(
      extractPartialJsonStringArgument('{"plan":"# Plan\\n\\n- inspect files', 'plan'),
    ).toBe('# Plan\n\n- inspect files')
    expect(
      extractPartialJsonStringArgument('{"plan":"# Plan\\n\\n- inspect files"}', 'plan'),
    ).toBe('# Plan\n\n- inspect files')
  })

  it('does not treat a plan-shaped fragment inside another JSON string as the plan', () => {
    expect(
      extractPartialJsonStringArgument(
        '{"note":"contains, \\\"plan\\\":\\\"wrong\\\"", "title":"ok"}',
        'plan',
      ),
    ).toBeUndefined()
  })

  it('bounds the live plan preview without changing short plans', () => {
    expect(truncatePlanProgress('short plan')).toBe('short plan')
    expect(truncatePlanProgress('x'.repeat(1601))).toHaveLength(1602)
  })
})
