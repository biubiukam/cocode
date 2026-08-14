import { Box, Text } from 'ink'
import { theme } from '../theme.ts'

export function Help(props: { text: string }) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.brand} bold>
        help <Text color={theme.mute}>· esc close</Text>
      </Text>
      {props.text.split('\n').map((line, index) => (
        <Text key={`${index}:${line}`} color={theme.dim}>
          {line === '' ? ' ' : line}
        </Text>
      ))}
    </Box>
  )
}
