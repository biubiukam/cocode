import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { resolveSessionRoot } from '../../../src/runtime/sessions-root.ts'

describe('resolveSessionRoot', () => {
  it('prefers an explicit absolute root', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: '/tmp/dsh-sessions' },
        productHome: '/tmp/cocode',
        cwd: '/work',
      }),
    ).toEqual({ path: '/tmp/dsh-sessions', source: 'DSH_SESSION_ROOT' })
  })

  it('resolves a relative override against cwd', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: 'sessions' },
        productHome: '/tmp/cocode',
        cwd: '/work/project',
      }),
    ).toEqual({ path: '/work/project/sessions', source: 'DSH_SESSION_ROOT' })
  })

  it('uses productHome sessions by default', () => {
    expect(
      resolveSessionRoot({
        env: {},
        productHome: '/tmp/cocode/../cocode-home',
        cwd: '/work',
      }),
    ).toEqual({ path: resolve('/tmp/cocode-home/sessions'), source: 'productHome' })
  })
})
