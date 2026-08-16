import { Box, Text } from 'ink'
import { parseDiffSummary, type DiffLine, type DiffSummary } from '../../runtime/diff-summary.ts'
import type { GitReview, ReviewScope } from '../../runtime/git-review.ts'
import type { ReviewPickerState } from '../../runtime/review-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

const DEFAULT_PREVIEW_ROWS = 16
const MAX_PREVIEW_FILES = 8
const MAX_PREVIEW_LINES = 80

export type ReviewPreviewFile = {
  path: string
  additions: number
  deletions: number
  binary: boolean
  untracked: boolean
  truncated: boolean
  lines: readonly DiffLine[]
  folded: boolean
}

export type ReviewPreview = {
  summary?: DiffSummary
  files: readonly ReviewPreviewFile[]
  foldedFiles: number
  fallback: readonly string[]
  fallbackFolded: boolean
}

/** Build a bounded, display-safe projection for the review overlay. */
export function buildReviewPreview(
  review: Pick<GitReview, 'patch' | 'diffSummary'> & { files?: GitReview['files'] },
  maxRows = DEFAULT_PREVIEW_ROWS,
): ReviewPreview {
  const parsed =
    review.diffSummary !== undefined && review.diffSummary.files.length > 0
      ? review.diffSummary
      : parseDiffSummary(review.patch, {
          maxFiles: MAX_PREVIEW_FILES,
          maxLinesPerFile: MAX_PREVIEW_LINES,
        })
  const lineBudget = Math.max(1, Math.min(12, Math.trunc(maxRows) - 5))
  if (parsed.files.length === 0) {
    const fallback = safeFallbackLines(review.patch, lineBudget + 1)
    const files = (review.files ?? []).slice(0, MAX_PREVIEW_FILES).map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      untracked: file.untracked ?? false,
      truncated: file.truncated,
      lines: [],
      folded: false,
    }))
    return {
      fallback: fallback.slice(0, lineBudget),
      fallbackFolded: fallback.length > lineBudget,
      files,
      foldedFiles: Math.max(0, (review.files?.length ?? 0) - files.length),
    }
  }

  const files: ReviewPreviewFile[] = []
  const metadataByPath = new Map((review.files ?? []).map((file) => [file.path, file]))
  const summaryPaths = new Set(parsed.files.map((file) => file.path))
  const previewFiles = [
    ...parsed.files,
    ...(review.files ?? [])
      .filter((file) => !summaryPaths.has(file.path))
      .map((file) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        binary: file.binary,
        truncated: file.truncated,
        lines: [],
      })),
  ]
  let remaining = lineBudget
  for (const file of previewFiles.slice(0, MAX_PREVIEW_FILES)) {
    if (remaining <= 0) break
    const displayLines = file.lines.filter((line) => line.kind !== 'header' && line.kind !== 'meta')
    const sourceLines = displayLines.length > 0 ? displayLines : file.lines
    const visible = sourceLines.slice(0, Math.max(0, remaining - 1))
    const metadata = metadataByPath.get(file.path)
    files.push({
      path: file.path,
      additions: metadata?.additions ?? file.additions,
      deletions: metadata?.deletions ?? file.deletions,
      binary: metadata?.binary ?? file.binary,
      untracked: metadata?.untracked ?? false,
      truncated: metadata?.truncated ?? file.truncated,
      lines: visible,
      folded: file.truncated || visible.length < sourceLines.length,
    })
    remaining -= 1 + visible.length
  }
  return {
    summary: parsed,
    files,
    foldedFiles: Math.max(
      0,
      Math.max(previewFiles.length, review.files?.length ?? 0) - files.length,
    ),
    fallback: [],
    fallbackFolded: false,
  }
}

export function ReviewPicker(props: {
  state: ReviewPickerState
  locale: UiLocale
  maxRows?: number
}) {
  const { state } = props
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={PANEL_BORDER}
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'reviewTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'reviewHint')}</Text>
      </Text>
      {state.phase === 'scope' ? <ScopeList state={state} locale={props.locale} /> : null}
      {state.phase === 'loading' ? (
        <Text color={theme.accent} wrap="truncate-end">
          {text(props.locale, 'reviewLoading')}
        </Text>
      ) : null}
      {state.phase === 'preview' ? (
        <Preview state={state} locale={props.locale} maxRows={props.maxRows} />
      ) : null}
    </Box>
  )
}

function ScopeList(props: {
  state: Extract<ReviewPickerState, { phase: 'scope' }>
  locale: UiLocale
}) {
  return (
    <>
      {props.state.scopes.map((scope, index) => {
        const active = index === props.state.selected
        return (
          <Text
            key={scope}
            {...selectionStyle(active)}
            wrap="truncate-end"
          >
            {active ? glyphs.optionActive : glyphs.optionInactive} {scopeLabel(scope, props.locale)}
          </Text>
        )
      })}
    </>
  )
}

function Preview(props: {
  state: Extract<ReviewPickerState, { phase: 'preview' }>
  locale: UiLocale
  maxRows?: number
}) {
  const review = props.state.review
  const preview = buildReviewPreview(review, props.maxRows)
  return (
    <>
      <Text color={theme.accent} wrap="truncate-end">
        {text(props.locale, 'reviewSummary', {
          files: String(review.files.length),
          additions: String(review.additions),
          deletions: String(review.deletions),
          binary:
            review.binaryFiles > 0
              ? ` · ${review.binaryFiles} ${text(props.locale, 'reviewBinary')}`
              : '',
          truncated: review.truncated ? ` · ${text(props.locale, 'reviewTruncated')}` : '',
        })}
      </Text>
      {preview.files.map((file) => (
        <Box key={file.path} flexDirection="column">
          <Text color={theme.text} wrap="truncate-end">
            {file.binary ? '▧' : '·'} {file.path} +{file.additions}/-{file.deletions}
            {file.binary ? ` · ${text(props.locale, 'reviewBinary')}` : ''}
            {file.untracked ? ` · ${text(props.locale, 'reviewUntracked')}` : ''}
            {file.truncated ? ` · ${text(props.locale, 'reviewTruncated')}` : ''}
          </Text>
          {file.lines.map((line, index) => (
            <DiffLineText key={`${file.path}:${index}`} line={line} />
          ))}
          {file.folded ? (
            <Text color={theme.mute}>… {text(props.locale, 'reviewDiffFolded')}</Text>
          ) : null}
        </Box>
      ))}
      {preview.foldedFiles > 0 ? (
        <Text color={theme.dim}>
          … +{preview.foldedFiles} {text(props.locale, 'reviewFilesFolded')}
        </Text>
      ) : null}
      {preview.fallback.map((line, index) => (
        <Text key={`fallback:${index}`} color={theme.mute} wrap="truncate-end">
          {line}
        </Text>
      ))}
      {preview.fallbackFolded ? (
        <Text color={theme.mute}>… {text(props.locale, 'reviewTextFolded')}</Text>
      ) : null}
      {review.omittedFiles.length > 0 ? (
        <Text color={theme.dim} wrap="truncate-end">
          {text(props.locale, 'reviewOmittedFiles', { count: String(review.omittedFiles.length) })}
        </Text>
      ) : null}
      <Text color={theme.accent} wrap="truncate-end">
        {text(props.locale, 'reviewConfirm')}
      </Text>
    </>
  )
}

function DiffLineText(props: { line: DiffLine }) {
  const { line } = props
  const color =
    line.kind === 'add'
      ? theme.success
      : line.kind === 'remove'
      ? theme.danger
      : line.kind === 'hunk'
      ? theme.accent
      : line.kind === 'header'
      ? theme.text
      : theme.dim
  const marker =
    line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : line.kind === 'context' ? ' ' : ''
  const lineNumber = line.newLine ?? line.oldLine
  return (
    <Text color={color} wrap="truncate-end">
      {marker !== '' ? `${marker} ${String(lineNumber ?? '').padStart(4, ' ')} ` : ''}
      {line.text}
    </Text>
  )
}

function safeFallbackLines(value: string, maxLines: number): string[] {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      stripControl(
        line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ''),
      ),
    )
    .filter((line) => line !== '')
    .slice(0, maxLines)
}

function stripControl(value: string): string {
  return [...value]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 9 || (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f))
    })
    .join('')
}

function scopeLabel(scope: ReviewScope, locale: UiLocale): string {
  if (scope === 'working-tree') return text(locale, 'reviewScopeWorkingTree')
  if (scope === 'staged') return text(locale, 'reviewScopeStaged')
  if (scope === 'last-commit') return text(locale, 'reviewScopeLastCommit')
  return text(locale, 'reviewScopeBranch')
}
