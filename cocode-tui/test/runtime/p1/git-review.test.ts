import { describe, expect, it } from 'vitest'
import {
  buildReviewPrompt,
  collectGitReview,
  parseReviewScope,
  type GitRunner,
} from '../../../src/runtime/git-review.ts'

function runnerFor(
  outputs: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>,
): GitRunner {
  return async (args) => {
    const key = args.join(' ')
    const value = outputs[key] ?? {}
    return { stdout: value.stdout ?? '', stderr: value.stderr ?? '', exitCode: value.exitCode ?? 0 }
  }
}

describe('git review workflow', () => {
  it('parses review scopes and branch bases', () => {
    expect(parseReviewScope('working-tree')).toEqual({ scope: 'working-tree' })
    expect(parseReviewScope('staged')).toEqual({ scope: 'staged' })
    expect(parseReviewScope('last-commit')).toEqual({ scope: 'last-commit' })
    expect(parseReviewScope('branch origin/main')).toEqual({ scope: 'branch', base: 'origin/main' })
    expect(parseReviewScope('unknown')).toBeUndefined()
  })

  it('builds a bounded prompt from a read-only diff', async () => {
    const diff = [
      'diff --git a/file with space.ts b/file with space.ts',
      '--- a/file with space.ts',
      '+++ b/file with space.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n')
    const runner = runnerFor({
      'rev-parse --show-toplevel': { stdout: '/work\n' },
      'status --porcelain=v1 -z --untracked-files=all': { stdout: '' },
      '-c core.quotePath=false diff --no-color --no-ext-diff --unified=3 HEAD --': { stdout: diff },
    })
    const review = await collectGitReview('/work', 'working-tree', undefined, runner)
    expect(review.files).toEqual([
      { path: 'file with space.ts', additions: 1, deletions: 1, binary: false, truncated: false },
    ])
    expect(review.prompt).toContain('[severity] file:line')
    expect(review.prompt).toContain('file with space.ts')
    expect(review.prompt).not.toContain('\u001b')
    expect(buildReviewPrompt(review)).toBe(review.prompt)
  })

  it('reports non-git errors without pretending the diff is empty', async () => {
    const runner = runnerFor({
      'rev-parse --show-toplevel': { stderr: 'fatal: not a git repository\n', exitCode: 128 },
    })
    await expect(collectGitReview('/tmp', 'staged', undefined, runner)).rejects.toThrow(
      'not a git repository',
    )
  })
})
