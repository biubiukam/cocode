import { Box, Text } from 'ink'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function HistorySearch(props: {
  query: string
  matches: readonly string[]
  selectedIndex: number
  locale: UiLocale
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
        {text(props.locale, 'history')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'historyHint')}</Text>
      </Text>
      <Text color={theme.text}>⌕ {props.query || text(props.locale, 'historyPlaceholder')}</Text>
      {props.matches.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'historyEmpty')}</Text>
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
