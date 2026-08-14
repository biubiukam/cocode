import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { homeDisplay, productHome } from '../../../src/runtime/auth/paths.ts'

function ctx(partial: { env?: NodeJS.ProcessEnv; homedir?: string; files?: string[] }) {
  const files = new Set(partial.files ?? [])
  return {
    env: partial.env ?? {},
    homedir: partial.homedir ?? '/Users/me',
    exists: (path: string) => files.has(path),
  }
}

describe('productHome', () => {
  it('resolves a relative COCODE_HOME against cwd', () => {
    expect(
      productHome(
        ctx({
          env: { COCODE_HOME: '.dev/home' },
        }),
      ),
    ).toBe(resolve('.dev/home'))
  })

  it('prefers COCODE_HOME over DSH_HOME', () => {
    expect(
      productHome(
        ctx({
          env: { COCODE_HOME: '/tmp/cocode', DSH_HOME: '/tmp/dsh' },
        }),
      ),
    ).toBe('/tmp/cocode')
  })

  it('uses DSH_HOME when COCODE_HOME is empty', () => {
    expect(
      productHome(
        ctx({
          env: { COCODE_HOME: '  ', DSH_HOME: '/tmp/dsh' },
        }),
      ),
    ).toBe('/tmp/dsh')
  })

  it('uses ~/.cocode when it already has product files', () => {
    expect(
      productHome(
        ctx({
          files: ['/Users/me/.cocode/.credentials.yaml'],
        }),
      ),
    ).toBe('/Users/me/.cocode')
  })

  it('falls back to existing ~/.dsh so GUI keys are shared', () => {
    expect(
      productHome(
        ctx({
          files: ['/Users/me/.dsh'],
        }),
      ),
    ).toBe('/Users/me/.dsh')
  })

  it('creates the new-user root at ~/.cocode', () => {
    expect(productHome(ctx({}))).toBe('/Users/me/.cocode')
  })
})

describe('homeDisplay', () => {
  it('never prints an absolute path', () => {
    expect(
      homeDisplay('/var/secret/home', {
        env: { COCODE_HOME: '/var/secret/home' },
        homedir: '/Users/me',
        exists: () => false,
      }),
    ).toBe('$COCODE_HOME')
    expect(homeDisplay('/Users/me/.cocode', ctx({}))).toBe('~/.cocode')
    expect(homeDisplay('/Users/me/.dsh', ctx({ files: ['/Users/me/.dsh'] }))).toBe('~/.dsh')
  })
})
