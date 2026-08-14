import { describe, expect, it } from 'vitest'
import { resolveWorkspaceInfo, workspaceName } from '../../src/runtime/workspace.ts'

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
})
