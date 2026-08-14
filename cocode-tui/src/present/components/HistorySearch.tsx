import { Box, Text } from 'ink'
import { theme } from '../theme.ts'

export function HistorySearch(props: {
  query: string
  matches: readonly string[]
  selectedIndex: number
}) {
  const selected =
    props.matches.length === 0
      ? 0
      : Math.max(0, Math.min(props.selectedIndex, props.matches.length - 1))
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Text color={theme.brand} bold>
        history <Text color={theme.mute}>· ctrl+r · ↑↓ select · enter use · esc close</Text>
      </Text>
      <Text color={theme.text}>⌕ {props.query || 'type to search…'}</Text>
      {props.matches.length === 0 ? (
        <Text color={theme.mute}>No matching messages</Text>
      ) : (
        props.matches.map((entry, index) => {
          const active = index === selected
          return (
            <Text
              key={`${index}:${entry}`}
              color={active ? theme.text : theme.mute}
              inverse={active}
            >
              {active ? '›' : ' '} {entry.replaceAll('\n', ' ↵ ')}
            </Text>
          )
        })
      )}
    </Box>
  )
}
