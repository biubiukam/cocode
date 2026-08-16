import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  projectToolSummary,
  toolArgumentSummary,
  toolDisplayState,
  toolErrorSummary,
  truncateCellWidth,
} from '../../src/present/tool-display.ts'
import type { ToolNode } from '../../src/runtime/nodes/types.ts'
import stringWidth from 'string-width'

describe('tool display helpers', () => {
  it('maps tool status to stable semantic labels', () => {
    expect(toolDisplayState({ status: 'running' }, 'en')).toMatchObject({
      mark: '◌',
      label: 'running',
    })
    expect(toolDisplayState({ status: 'error' }, 'zh')).toMatchObject({
      mark: '×',
      label: '失败',
    })
    expect(toolDisplayState({ status: 'success' }, 'en')).toMatchObject({
      mark: '✓',
      label: 'done',
    })
  })

  it('summarizes arguments and errors on one line', () => {
    expect(toolArgumentSummary('{"path":"src/main.ts"}')).toContain('src/main.ts')
    expect(toolErrorSummary({ name: 'Permission denied', code: 'EACCES' })).toBe(
      'Permission denied (EACCES)',
    )
  })

  it('formats elapsed time without inventing completed duration', () => {
    expect(formatElapsed(1000, 1500)).toBe('<1s')
    expect(formatElapsed(1000, 62_000)).toBe('1m 1s')
    expect(formatElapsed(0, 1000)).toBeUndefined()
  })

  it('selects exactly one primary detail by error, typed view, args, then result', () => {
    const base = toolNode({
      args: '{"path":"argument.ts"}',
      result: 'result line\nsecond line',
      view: { kind: 'read', path: 'typed.ts' },
    })
    expect(projectToolSummary(base, 'en', 80, 2_000).primaryDetail).toBe('typed.ts')
    expect(
      projectToolSummary(
        { ...base, status: 'error', error: { name: 'Denied', code: 'EACCES' } },
        'en',
        80,
        2_000,
      ).primaryDetail,
    ).toBe('Denied (EACCES)')
    expect(
      projectToolSummary(
        { ...base, status: 'error', error: undefined, result: 'permission denied\nstack' },
        'en',
        80,
        2_000,
      ).primaryDetail,
    ).toBe('permission denied')
    expect(projectToolSummary({ ...base, view: undefined }, 'en', 80, 2_000).primaryDetail).toBe(
      '{"path":"argument.ts"}',
    )
    expect(
      projectToolSummary({ ...base, view: undefined, args: '{}' }, 'en', 80, 2_000)
        .primaryDetail,
    ).toBe('result line')
  })

  it('localizes missing names and exposes only real running elapsed time', () => {
    const running = toolNode({ name: '', status: 'running', time: 1_000 })
    expect(projectToolSummary(running, 'zh', 80, 3_500)).toMatchObject({
      name: '工具',
      statusLabel: '运行中',
      elapsed: '2s',
      tone: 'info',
    })
    expect(projectToolSummary({ ...running, status: 'success' }, 'en', 80, 3_500).elapsed)
      .toBeUndefined()
  })

  it('sanitizes and truncates ANSI, controls, Chinese, emoji, paths, and commands by cell width', () => {
    for (const value of [
      '\u001b[31m红色\u001b[0m\u0000文字',
      '中文路径/非常长的文件名.ts',
      '👩🏽‍💻🚀 command --with-a-very-long-value',
    ]) {
      const clipped = truncateCellWidth(value, 12)
      expect(stringWidth(clipped)).toBeLessThanOrEqual(12)
      expect(clipped).not.toContain('\u001b')
      expect(clipped).not.toContain('\u0000')
    }
    const columns = 36
    const projected = projectToolSummary(
      toolNode({
        name: 'terminal',
        view: { kind: 'terminal', command: 'echo 中文 👩🏽‍💻 --very-long-command-value' },
      }),
      'en',
      columns,
      2_000,
    )
    const line = `↳ ${projected.mark} ${projected.name} · ${projected.statusLabel}${
      projected.elapsed === undefined ? '' : ` · ${projected.elapsed}`
    }${projected.primaryDetail === undefined ? '' : ` · ${projected.primaryDetail}`}`
    expect(stringWidth(line)).toBeLessThanOrEqual(columns)
  })

  it('redacts sensitive values from argument fallbacks', () => {
    expect(toolArgumentSummary('{"query":"ok","apiKey":"secret-value"}', 100)).toBe(
      '{"query":"ok","apiKey":"[redacted]"}',
    )
  })
})

function toolNode(overrides: Partial<ToolNode> = {}): ToolNode {
  return {
    kind: 'tool',
    id: 'tool-1',
    seq: 1,
    time: 1,
    callId: 'call-1',
    name: 'read',
    args: '{}',
    status: 'success',
    ...overrides,
  }
}
