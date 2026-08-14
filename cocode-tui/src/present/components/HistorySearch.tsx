import { Box, Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function HistorySearch(props: {
  query: string
  matches: readonly string[]
  selectedIndex: number
  locale: UiLocale
  maxRows?: number
}) {
  const selected =
    props.matches.length === 0
      ? 0
      : Math.max(0, Math.min(props.selectedIndex, props.matches.length - 1))
  const capacity =
    props.maxRows === undefined
      ? Math.max(1, props.matches.length)
      : Math.max(0, Math.trunc(props.maxRows) - 5)
  const start = listWindowStart(selected, props.matches.length, Math.max(1, capacity))
  const visible = capacity === 0 ? [] : props.matches.slice(start, start + capacity)
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Text color={theme.brand} bold wrap="truncate-end">
        {text(props.locale, 'history')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'historyHint')}</Text>
      </Text>
      <Text color={theme.text} wrap="truncate-end">
        ⌕ {props.query || text(props.locale, 'historyPlaceholder')}
      </Text>
      {props.matches.length === 0 && capacity > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'historyEmpty')}
        </Text>
      ) : (
        visible.map((entry, offset) => {
          const active = start + offset === selected
          return (
            <Text
              key={`${start + offset}:${entry}`}
              color={active ? theme.text : theme.mute}
              inverse={active}
              wrap="truncate-end"
            >
              {active ? '›' : ' '} {entry.replaceAll('\n', ' ↵ ')}
            </Text>
          )
        })
      )}
    </Box>
  )
}
