import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  toolArgumentSummary,
  toolDisplayState,
  toolErrorSummary,
} from '../../src/present/tool-display.ts'

describe('tool display helpers', () => {
  it('maps tool status to stable semantic labels', () => {
    expect(toolDisplayState({ status: 'running' }, 'en').label).toBe('running')
    expect(toolDisplayState({ status: 'error' }, 'zh').label).toBe('失败')
    expect(toolDisplayState({ status: 'success' }, 'en').mark).toBe('✓')
  })

  it('summarizes arguments and errors on one line', () => {
    expect(toolArgumentSummary('{"path":"src/main.ts"}')).toContain('src/main.ts')
    expect(toolErrorSummary({ name: 'Permission denied', code: 'EACCES' })).toBe('Permission denied')
  })

  it('formats elapsed time without inventing completed duration', () => {
    expect(formatElapsed(1000, 1500)).toBe('<1s')
    expect(formatElapsed(1000, 62_000)).toBe('1m 1s')
    expect(formatElapsed(0, 1000)).toBeUndefined()
  })
})
