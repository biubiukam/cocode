import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { homeDisplay, productHome } from '../../../src/runtime/auth/paths.ts'

const testHome = resolve('test-home')

function ctx(partial: { env?: NodeJS.ProcessEnv; homedir?: string; files?: string[] }) {
  const files = new Set(partial.files ?? [])
  return {
    env: partial.env ?? {},
    homedir: partial.homedir ?? testHome,
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
    const cocodeHome = resolve('tmp', 'cocode')
    const dshHome = resolve('tmp', 'dsh')
    expect(
      productHome(
        ctx({
          env: { COCODE_HOME: cocodeHome, DSH_HOME: dshHome },
        }),
      ),
    ).toBe(cocodeHome)
  })

  it('uses DSH_HOME when COCODE_HOME is empty', () => {
    const dshHome = resolve('tmp', 'dsh')
    expect(
      productHome(
        ctx({
          env: { COCODE_HOME: '  ', DSH_HOME: dshHome },
        }),
      ),
    ).toBe(dshHome)
  })

  it('uses ~/.cocode when it already has product files', () => {
    expect(
      productHome(
        ctx({
          files: [join(testHome, '.cocode', '.credentials.yaml')],
        }),
      ),
    ).toBe(join(testHome, '.cocode'))
  })

  it('falls back to existing ~/.dsh so GUI keys are shared', () => {
    expect(
      productHome(
        ctx({
          files: [join(testHome, '.dsh')],
        }),
      ),
    ).toBe(join(testHome, '.dsh'))
  })

  it('creates the new-user root at ~/.cocode', () => {
    expect(productHome(ctx({}))).toBe(join(testHome, '.cocode'))
  })
})

describe('homeDisplay', () => {
  it('never prints an absolute path', () => {
    const privateHome = resolve('private-home')
    expect(
      homeDisplay(privateHome, {
        env: { COCODE_HOME: privateHome },
        homedir: testHome,
        exists: () => false,
      }),
    ).toBe('$COCODE_HOME')
    expect(homeDisplay(join(testHome, '.cocode'), ctx({}))).toBe('~/.cocode')
    expect(homeDisplay(join(testHome, '.dsh'), ctx({ files: [join(testHome, '.dsh')] }))).toBe(
      '~/.dsh',
    )
  })
})
