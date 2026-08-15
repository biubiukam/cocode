import { Box, Text } from 'ink'
import type { ReviewPickerState } from '../../runtime/review-picker.ts'
import type { ReviewScope } from '../../runtime/git-review.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'

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
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'reviewTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'reviewHint')}</Text>
      </Text>
      {state.phase === 'scope' ? <ScopeList state={state} locale={props.locale} /> : null}
      {state.phase === 'loading' ? (
        <Text color={theme.info} wrap="truncate-end">
          {text(props.locale, 'reviewLoading')}
        </Text>
      ) : null}
      {state.phase === 'preview' ? <Preview state={state} locale={props.locale} /> : null}
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
            inverse={active}
            color={active ? theme.text : theme.mute}
            wrap="truncate-end"
          >
            {active ? '›' : ' '} {scopeLabel(scope, props.locale)}
          </Text>
        )
      })}
    </>
  )
}

function Preview(props: {
  state: Extract<ReviewPickerState, { phase: 'preview' }>
  locale: UiLocale
}) {
  const review = props.state.review
  return (
    <>
      <Text color={theme.info} wrap="truncate-end">
        {review.files.length} files · +{review.additions}/-{review.deletions}
        {review.binaryFiles > 0 ? ` · ${review.binaryFiles} binary` : ''}
        {review.truncated ? ' · truncated' : ''}
      </Text>
      {review.files.slice(0, 8).map((file) => (
        <Text
          key={`${file.path}:${file.untracked ? 'u' : 't'}`}
          color={theme.mute}
          wrap="truncate-end"
        >
          {file.binary ? '▧' : '·'} {file.path} +{file.additions}/-{file.deletions}
          {file.untracked ? ' · untracked' : ''}
          {file.truncated ? ' · truncated' : ''}
        </Text>
      ))}
      {review.files.length > 8 ? (
        <Text color={theme.dim}>… +{review.files.length - 8} files</Text>
      ) : null}
      {review.omittedFiles.length > 0 ? (
        <Text color={theme.dim} wrap="truncate-end">
          … {review.omittedFiles.length} untracked files omitted
        </Text>
      ) : null}
      <Text color={theme.brand} wrap="truncate-end">
        {text(props.locale, 'reviewConfirm')}
      </Text>
    </>
  )
}

function scopeLabel(scope: ReviewScope, locale: UiLocale): string {
  if (scope === 'working-tree') return text(locale, 'reviewScopeWorkingTree')
  if (scope === 'staged') return text(locale, 'reviewScopeStaged')
  if (scope === 'last-commit') return text(locale, 'reviewScopeLastCommit')
  return text(locale, 'reviewScopeBranch')
}
