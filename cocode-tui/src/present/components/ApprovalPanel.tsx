import { Box, Text, useInput } from 'ink'
import type { TuiAction, TuiApprovalSnapshot } from '../../runtime/app.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import { sanitizeSingleLine } from '../text-format.ts'

export function ApprovalPanel(props: {
  state: TuiApprovalSnapshot
  locale: UiLocale
  dispatch: (action: TuiAction) => void
}) {
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      props.dispatch({ type: 'approval.cancel' })
      return
    }
    if (input === 'a' || key.return) {
      props.dispatch({ type: 'approval.answer', outcome: 'allowed-once' })
      return
    }
    if (input === 't') {
      props.dispatch({ type: 'approval.answer', outcome: 'allowed-for-turn' })
      return
    }
    if (input === 'd' || input === 'n') {
      props.dispatch({ type: 'approval.answer', outcome: 'rejected' })
    }
  })

  const request = props.state.request
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
    >
      <Text color={theme.accent} bold>
        {text(props.locale, 'approvalTitle')}
      </Text>
      <Text color={theme.text} wrap="wrap">
        {sanitizeSingleLine(request.toolName)}
      </Text>
      <Text color={theme.dim} wrap="wrap">
        {text(props.locale, 'approvalTarget')}:{' '}
        {sanitizeSingleLine(request.target ?? text(props.locale, 'approvalUnavailableValue'))}
      </Text>
      <Text color={theme.dim} wrap="wrap">
        {text(props.locale, 'approvalRisk')}:{' '}
        {sanitizeSingleLine(
          request.risk ?? request.reason ?? text(props.locale, 'approvalUnavailableValue'),
        )}
      </Text>
      <Text color={theme.dim} wrap="wrap">
        {text(props.locale, 'approvalSource')}: {sanitizeSingleLine(request.source ?? 'runtime')}
      </Text>
      <Text color={theme.mute} wrap="truncate-end">
        {text(props.locale, 'approvalHint')}
      </Text>
    </Box>
  )
}
