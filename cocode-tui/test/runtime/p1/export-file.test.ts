import { basename, join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { safeSessionLabel, writeSessionExport } from '../../../src/runtime/export-file.ts'

describe('session export files', () => {
  it('removes characters forbidden in Windows filenames', () => {
    expect(safeSessionLabel('bad:<id>?*')).toBe('bad--id-')
    expect(safeSessionLabel('...')).toBe('session')
  })

  it('writes a portable filename without overwriting', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-export-'))
    try {
      const first = await writeSessionExport(cwd, 'bad:<id>?*', [])
      const second = await writeSessionExport(cwd, 'bad:<id>?*', [])
      expect(basename(first)).toBe('cocode-export-bad--id-.md')
      expect(basename(second)).toBe('cocode-export-bad--id--1.md')
      expect(await readFile(first, 'utf8')).toBe('# Cocode Session\n')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
