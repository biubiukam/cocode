import { describe, expect, it } from 'vitest'
import { resolveWorkspaceInfo, workspaceName, workspacePath } from '../../src/runtime/workspace.ts'

describe('workspace info', () => {
  it('uses the cwd basename and injected branch query', async () => {
    await expect(resolveWorkspaceInfo('/tmp/cocode', async () => 'feat/tui')).resolves.toEqual({
      name: 'cocode',
      branch: 'feat/tui',
    })
  })

  it('hides branch when git lookup fails or is detached', async () => {
    await expect(
      resolveWorkspaceInfo('/tmp/cocode', async () => {
        throw new Error('not a repository')
      }),
    ).resolves.toEqual({ name: 'cocode' })
    await expect(resolveWorkspaceInfo('/tmp/cocode', async () => 'HEAD')).resolves.toEqual({
      name: 'cocode',
    })
  })

  it('keeps a useful name for the filesystem root', () => {
    expect(workspaceName('/')).toBe('/')
  })

  it('shortens paths inside the home directory and keeps external paths absolute', () => {
    expect(workspacePath('/Users/coder/Documents/cocode-tui', '/Users/coder')).toBe(
      '~/Documents/cocode-tui',
    )
    expect(workspacePath('/tmp/cocode-tui', '/Users/coder')).toBe('/tmp/cocode-tui')
    expect(workspacePath('/Users/coder', '/Users/coder')).toBe('~')
  })
})
