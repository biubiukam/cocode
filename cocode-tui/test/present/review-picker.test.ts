import { describe, expect, it } from 'vitest'
import { buildReviewPreview } from '../../src/present/components/ReviewPicker.tsx'

describe('review picker diff preview', () => {
  it('renders structured additions and removals with bounded line numbers', () => {
    const preview = buildReviewPreview(
      {
        patch: [
          'diff --git a/src/app.ts b/src/app.ts',
          '--- a/src/app.ts',
          '+++ b/src/app.ts',
          '@@ -4,2 +4,3 @@',
          ' keep',
          '-old value',
          '+new value',
          '+another value',
        ].join('\n'),
      },
      10,
    )

    expect(preview.files).toHaveLength(1)
    expect(preview.files[0]).toMatchObject({ path: 'src/app.ts', folded: true })
    expect(preview.files[0]?.lines).toEqual([
      { kind: 'hunk', text: '@@ -4,2 +4,3 @@' },
      { kind: 'context', text: 'keep', oldLine: 4, newLine: 4 },
      { kind: 'remove', text: 'old value', oldLine: 5 },
      { kind: 'add', text: 'new value', newLine: 5 },
    ])
  })

  it('falls back to cleaned text when the patch cannot be parsed', () => {
    const preview = buildReviewPreview(
      {
        patch: '\u001b[31mraw output\u001b[0m\nsecond',
        files: [
          {
            path: 'assets/logo.png',
            additions: 0,
            deletions: 0,
            binary: true,
            truncated: false,
            untracked: true,
          },
        ],
      },
      8,
    )

    expect(preview.files).toMatchObject([
      { path: 'assets/logo.png', binary: true, untracked: true, lines: [] },
    ])
    expect(preview.fallback).toEqual(['raw output', 'second'])
  })

  it('prefers an existing structured summary over malformed patch text', () => {
    const preview = buildReviewPreview({
      patch: 'not a unified diff',
      diffSummary: {
        files: [
          {
            path: 'src/app.ts',
            additions: 1,
            deletions: 0,
            binary: false,
            truncated: false,
            lines: [{ kind: 'add', text: 'new value', newLine: 9 }],
          },
        ],
        additions: 1,
        deletions: 0,
        truncated: false,
        binaryFiles: 0,
      },
    })

    expect(preview.fallback).toEqual([])
    expect(preview.files[0]?.lines[0]).toEqual({
      kind: 'add',
      text: 'new value',
      newLine: 9,
    })
  })
})
