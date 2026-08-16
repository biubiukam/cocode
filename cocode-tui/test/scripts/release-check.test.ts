import { describe, expect, it } from 'vitest'
import {
  formatPackFailure,
  npmCommandForPlatform,
  npmSpawnOptionsForPlatform,
} from '../../scripts/release-check-utils.mjs'

describe('release check process helpers', () => {
  it('uses the Windows npm command shim', () => {
    expect(npmCommandForPlatform('win32')).toBe('npm.cmd')
    expect(npmCommandForPlatform('linux')).toBe('npm')
    expect(npmCommandForPlatform('darwin')).toBe('npm')
  })

  it('runs the Windows npm shim through a shell', () => {
    expect(npmSpawnOptionsForPlatform('win32')).toEqual({ shell: true })
    expect(npmSpawnOptionsForPlatform('linux')).toEqual({})
  })

  it('formats a spawn failure even when no output streams exist', () => {
    expect(
      formatPackFailure({
        error: new Error('spawnSync npm.cmd ENOENT'),
        status: null,
        stdout: undefined,
        stderr: undefined,
      }),
    ).toBe('spawnSync npm.cmd ENOENT')
  })

  it('prefers npm stderr over stdout when both are present', () => {
    expect(
      formatPackFailure({
        error: undefined,
        status: 1,
        stdout: 'stdout output',
        stderr: 'stderr output',
      }),
    ).toBe('stderr output')
  })
})
