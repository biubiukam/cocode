import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listWorkspaceFiles, rankFileMatches } from '../../../src/runtime/workspace-files.ts'

describe('workspace files', () => {
  it('falls back to bounded local discovery', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-files-'))
    try {
      await mkdir(join(cwd, 'src'), { recursive: true })
      await mkdir(join(cwd, 'node_modules'), { recursive: true })
      await writeFile(join(cwd, 'src', 'main.ts'), 'export {}\n')
      await writeFile(join(cwd, 'node_modules', 'ignored.js'), 'ignored\n')
      const files = await listWorkspaceFiles({ cwd })
      expect(files).toContain('src/main.ts')
      expect(files).not.toContain('node_modules/ignored.js')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('ranks basename and prefix matches ahead of broad matches', () => {
    expect(rankFileMatches(['docs/readme.md', 'src/readme.ts', 'src/main.ts'], 'read', 2)).toEqual([
      'docs/readme.md',
      'src/readme.ts',
    ])
  })
})
