import { Box, Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function FileMenu(props: {
  items: readonly string[]
  selectedIndex: number
  query: string
  loading?: boolean
  locale: UiLocale
  maxRows?: number
}) {
  if (props.items.length === 0 && !props.loading) return null
  const selected =
    props.items.length === 0
      ? 0
      : Math.max(0, Math.min(props.selectedIndex, props.items.length - 1))
  const chromeRows = 4 + (props.loading ? 1 : 0)
  const capacity =
    props.maxRows === undefined
      ? props.items.length
      : Math.max(0, Math.min(props.items.length, Math.trunc(props.maxRows) - chromeRows))
  const start = listWindowStart(selected, props.items.length, Math.max(1, capacity))
  const visible = capacity === 0 ? [] : props.items.slice(start, start + capacity)
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.dim} bold wrap="truncate-end">
        {text(props.locale, 'files')}{' '}
        <Text color={theme.mute}>
          · @{props.query || '…'} · {text(props.locale, 'filesHint')}
        </Text>
      </Text>
      {props.loading ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'filesSearching')}
        </Text>
      ) : null}
      {visible.map((item, offset) => {
        const active = start + offset === selected
        return (
          <Text
            key={item}
            color={active ? theme.text : theme.mute}
            inverse={active}
            wrap="truncate-end"
          >
            {active ? '›' : ' '} @{item}
          </Text>
        )
      })}
    </Box>
  )
}
