import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  accountHome,
  dshHome,
  homeDisplay,
  productHome,
  productHomes,
} from '../../../src/runtime/auth/paths.ts'

const testHome = resolve('test-home')

function ctx(partial: { env?: NodeJS.ProcessEnv; homedir?: string; files?: string[] }) {
  const files = new Set(partial.files ?? [])
  return {
    env: partial.env ?? {},
    homedir: partial.homedir ?? testHome,
    exists: (path: string) => files.has(path),
  }
}

describe('home resolution', () => {
  it('resolves a relative COCODE_HOME against cwd', () => {
    expect(
      accountHome(
        ctx({
          env: { COCODE_HOME: '.dev/home' },
        }),
      ),
    ).toBe(resolve('.dev/home'))
  })

  it('keeps COCODE_HOME and DSH_HOME independent', () => {
    const cocodeHome = resolve('tmp', 'cocode')
    const dshRoot = resolve('tmp', 'dsh')
    const context = ctx({ env: { COCODE_HOME: cocodeHome, DSH_HOME: dshRoot } })
    expect(accountHome(context)).toBe(cocodeHome)
    expect(dshHome(context)).toBe(dshRoot)
    expect(productHomes(context)).toEqual({ accountHome: cocodeHome, dshHome: dshRoot })
  })

  it('uses DSH_HOME only for the harness home when COCODE_HOME is empty', () => {
    const dshRoot = resolve('tmp', 'dsh')
    expect(
      dshHome(
        ctx({
          env: { COCODE_HOME: '  ', DSH_HOME: dshRoot },
        }),
      ),
    ).toBe(dshRoot)
  })

  it('uses ~/.cocode for the account home without inspecting marker files', () => {
    expect(accountHome(ctx({ files: [join(testHome, '.cocode', '.credentials.yaml')] }))).toBe(
      join(testHome, '.cocode'),
    )
  })

  it('uses ~/.dsh for DSH data even when it does not exist yet', () => {
    expect(dshHome(ctx({ files: [join(testHome, '.dsh')] }))).toBe(join(testHome, '.dsh'))
  })

  it('keeps the deprecated productHome alias on ~/.dsh', () => {
    expect(productHome(ctx({}))).toBe(join(testHome, '.dsh'))
  })
})

describe('homeDisplay', () => {
  it('never prints an absolute path', () => {
    const privateHome = resolve('private-home')
    expect(
      homeDisplay(privateHome, {
        env: { COCODE_HOME: privateHome },
        homedir: testHome,
      }),
    ).toBe('$COCODE_HOME')
    expect(homeDisplay(join(testHome, '.cocode'), ctx({}))).toBe('~/.cocode')
    expect(homeDisplay(join(testHome, '.dsh'), ctx({}))).toBe('~/.dsh')
  })
})
