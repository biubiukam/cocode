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

  it('uses COCODE_HOME sessions when configured', () => {
    expect(
      resolveSessionRoot({
        env: { COCODE_HOME: resolve('cocode-home') },
        cwd,
        homedir,
      }),
    ).toEqual({ path: resolve('cocode-home', 'sessions'), source: 'COCODE_HOME' })
  })

  it('expands tilde in COCODE_HOME and DSH_SESSION_ROOT', () => {
    expect(
      resolveSessionRoot({
        env: { COCODE_HOME: '~/.cocode' },
        cwd,
        homedir,
      }),
    ).toEqual({ path: join(homedir, '.cocode', 'sessions'), source: 'COCODE_HOME' })
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: '~/.dsh/sessions' },
        cwd,
        homedir,
      }),
    ).toEqual({ path: join(homedir, '.dsh', 'sessions'), source: 'DSH_SESSION_ROOT' })
  })

  it('uses ~/.cocode/sessions by default', () => {
    expect(
      resolveSessionRoot({
        env: {},
        cwd,
        homedir,
      }),
    ).toEqual({ path: join(homedir, '.cocode', 'sessions'), source: 'default' })
  })

  it('ignores an ambient official session root when the Cocode runtime home is known', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: resolve('.dsh', 'sessions') },
        cwd,
        homedir,
        runtimeHome: resolve('cocode-home'),
      }),
    ).toEqual({ path: resolve('cocode-home', 'sessions'), source: 'COCODE_HOME' })
  })

  it('keeps explicit session roots that remain below the Cocode home', () => {
    expect(
      resolveSessionRoot({
        env: { DSH_SESSION_ROOT: resolve('cocode-home', 'sessions', 'legacy') },
        cwd,
        homedir,
        runtimeHome: resolve('cocode-home'),
      }),
    ).toEqual({ path: resolve('cocode-home', 'sessions', 'legacy'), source: 'DSH_SESSION_ROOT' })
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

  it('expands COCODE_HOME with Windows path semantics', () => {
    expect(
      resolveSessionRoot({
        env: { COCODE_HOME: '~/.cocode' },
        cwd: 'C:\\workspace',
        homedir: 'C:\\Users\\coder',
        platform: 'win32',
      }),
    ).toEqual({ path: 'C:\\Users\\coder\\.cocode\\sessions', source: 'COCODE_HOME' })
  })
})
