import { describe, expect, it } from 'vitest'
import { inferToolView, toolViewDetail } from '../../../src/runtime/nodes/tool-view.ts'
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
})
