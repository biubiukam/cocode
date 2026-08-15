import { Box, Text } from 'ink'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function Help(props: { text: string; locale: UiLocale; maxRows?: number }) {
  const lines = props.text.split('\n')
  const capacity =
    props.maxRows === undefined
      ? lines.length
      : Math.max(0, Math.min(lines.length, Math.trunc(props.maxRows) - 4))
  const visible = lines.slice(0, capacity)
  if (capacity > 0 && capacity < lines.length) visible[capacity - 1] = '…'
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
      {visible.map((line, index) => (
        <Text key={`${index}:${line}`} color={theme.dim} wrap="truncate-end">
          {line === '' ? ' ' : line}
        </Text>
      ))}
    </Box>
  )
}
