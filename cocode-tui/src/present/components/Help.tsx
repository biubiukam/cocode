import { Box, Text } from 'ink'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function Help(props: { text: string; locale: UiLocale }) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.brand} bold>
        {text(props.locale, 'help')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'helpHint')}</Text>
      </Text>
      {props.text.split('\n').map((line, index) => (
        <Text key={`${index}:${line}`} color={theme.dim}>
          {line === '' ? ' ' : line}
        </Text>
      ))}
    </Box>
  )
}
