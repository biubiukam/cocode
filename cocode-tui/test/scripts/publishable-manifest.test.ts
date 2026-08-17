import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyPublishableManifest,
  restorePublishableManifest,
  toPublishablePackageJson,
} from '../../scripts/publishable-manifest.mjs'

describe('publishable TUI package.json', () => {
  it('rewrites a link: supervisor dependency to the sibling version', () => {
    const publishable = toPublishablePackageJson(
      {
        dependencies: {
          '@cocode/host-supervisor': 'link:../cocode-host-supervisor',
          tsx: '^4.20.5',
        },
      },
      '0.1.0',
    )

    expect(publishable.dependencies['@cocode/host-supervisor']).toBe('0.1.0')
    expect(publishable.dependencies.tsx).toBe('^4.20.5')
  })

  it('keeps an already versioned supervisor dependency', () => {
    const publishable = toPublishablePackageJson(
      {
        dependencies: {
          '@cocode/host-supervisor': '0.1.0',
        },
      },
      '0.1.0',
    )

    expect(publishable.dependencies['@cocode/host-supervisor']).toBe('0.1.0')
  })

  it('does not mutate the source manifest', () => {
    const source = {
      dependencies: {
        '@cocode/host-supervisor': 'link:../cocode-host-supervisor',
      },
    }

    toPublishablePackageJson(source, '0.1.0')

    expect(source.dependencies['@cocode/host-supervisor']).toBe(
      'link:../cocode-host-supervisor',
    )
  })

  it('applies a versioned supervisor dependency and restores the source link', () => {
    const repo = mkdtempSync(join(tmpdir(), 'cocode-pack-'))
    const tui = join(repo, 'cocode-tui')
    mkdirSync(tui)
    mkdirSync(join(repo, 'cocode-host-supervisor'))
    writeFileSync(
      join(repo, 'cocode-host-supervisor', 'package.json'),
      JSON.stringify({ name: '@cocode/host-supervisor', version: '0.1.0' }),
    )
    const source = `${JSON.stringify({
      dependencies: { '@cocode/host-supervisor': 'link:../cocode-host-supervisor' },
    }, null, 2)}\n`
    writeFileSync(join(tui, 'package.json'), source)

    try {
      applyPublishableManifest(tui)
      expect(JSON.parse(readFileSync(join(tui, 'package.json'), 'utf8')).dependencies['@cocode/host-supervisor']).toBe(
        '0.1.0',
      )
      restorePublishableManifest(tui)
      expect(readFileSync(join(tui, 'package.json'), 'utf8')).toBe(source)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})
