import { Box, Text } from 'ink'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

export function QuitConfirmation(props: {
  locale: UiLocale
  maxRows?: number
  maxColumns?: number
  selection: 'confirm' | 'cancel'
}) {
  const width = Math.max(1, Math.min(48, Math.trunc(props.maxColumns ?? 48)))
  return (
    <Box width="100%" height={Math.max(1, Math.trunc(props.maxRows ?? 7))} alignItems="center">
      <Box
        width={width}
        flexDirection="column"
        alignItems="center"
        borderStyle={PANEL_BORDER}
        borderColor={theme.warning}
        paddingX={2}
      >
        <Text color={theme.text} bold wrap="truncate-end">
          {text(props.locale, 'quitTitle')}
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text} inverse={props.selection === 'confirm'}>
            {` ${text(props.locale, 'quitConfirm')} `}
          </Text>
          <Text> </Text>
          <Text color={theme.mute} inverse={props.selection === 'cancel'}>
            {` ${text(props.locale, 'quitCancel')} `}
          </Text>
        </Box>
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'quitHint')}
        </Text>
      </Box>
    </Box>
  )
}
