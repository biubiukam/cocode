import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { resolveSessionRoot } from '../../../src/runtime/sessions-root.ts'

const cwd = resolve('test-workspace')
const homedir = resolve('test-home')

describe('resolveSessionRoot', () => {
  it('prefers an explicit absolute root', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: resolve('dsh-sessions') },
        cwd,
        homedir,
      }),
    ).toEqual({ path: resolve('dsh-sessions'), source: 'DSH_SESSION_ROOT' })
  })

  it('resolves a relative override against cwd', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: 'sessions' },
        cwd,
        homedir,
      }),
    ).toEqual({ path: resolve(cwd, 'sessions'), source: 'DSH_SESSION_ROOT' })
  })

  it('uses DSH_HOME sessions when configured', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_HOME: resolve('dsh-home') },
        cwd,
        homedir,
      }),
    ).toEqual({ path: resolve('dsh-home', 'sessions'), source: 'DSH_HOME' })
  })

  it('uses ~/.dsh/sessions by default', () => {
    expect(
      resolveSessionRoot({
        env: {},
        cwd,
        homedir,
      }),
    ).toEqual({ path: join(homedir, '.dsh', 'sessions'), source: 'default' })
  })

  it('uses Windows path semantics when the platform is simulated', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: 'sessions' },
        cwd: 'C:\\workspace',
        homedir: 'C:\\Users\\coder',
        platform: 'win32',
      }),
    ).toEqual({ path: 'C:\\workspace\\sessions', source: 'DSH_SESSION_ROOT' })
  })
})
