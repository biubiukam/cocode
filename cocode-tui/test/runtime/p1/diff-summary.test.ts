import { describe, expect, it } from 'vitest'
import { formatDiffSummary, parseDiffSummary } from '../../../src/runtime/diff-summary.ts'

describe('diff summary projection', () => {
  it('tracks files, additions, deletions, and line numbers', () => {
    const summary = parseDiffSummary(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,2 +1,3 @@',
        ' const value = 1',
        '-const oldValue = 2',
        '+const nextValue = 3',
        '+const finalValue = 4',
      ].join('\n'),
    )
    expect(summary).toMatchObject({ additions: 2, deletions: 1, files: [{ path: 'src/app.ts' }] })
    expect(summary.files[0]?.lines).toEqual(
      expect.arrayContaining([
        { kind: 'remove', text: 'const oldValue = 2', oldLine: 2 },
        { kind: 'add', text: 'const nextValue = 3', newLine: 2 },
      ]),
    )
    expect(formatDiffSummary(summary)).toContain('src/app.ts (+2/-1)')
  })

  it('marks binary and bounded output without exposing terminal controls', () => {
    const summary = parseDiffSummary(
      'diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n\u001b[31msecret\u001b[0m',
      { maxLinesPerFile: 1 },
    )
    expect(summary.binaryFiles).toBe(1)
    expect(summary.files[0]?.binary).toBe(true)
    expect(summary.files[0]?.lines.every((line) => !line.text.includes('\u001b'))).toBe(true)
  })

  it('folds large file previews while retaining complete line counts', () => {
    const summary = parseDiffSummary(
      [
        'diff --git a/file.ts b/file.ts',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,1 +1,3 @@',
        ' old',
        '+one',
        '+two',
      ].join('\n'),
      { maxLinesPerFile: 2 },
    )
    expect(summary.files[0]).toMatchObject({ additions: 2, deletions: 0, truncated: true })
    expect(summary.truncated).toBe(true)
  })
})
