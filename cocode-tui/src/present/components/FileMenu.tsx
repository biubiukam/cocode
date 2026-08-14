import { Box, Text } from 'ink'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function FileMenu(props: {
  items: readonly string[]
  selectedIndex: number
  query: string
  loading?: boolean
  locale: UiLocale
}) {
  if (props.items.length === 0 && !props.loading) return null
  const selected =
    props.items.length === 0
      ? 0
      : Math.max(0, Math.min(props.selectedIndex, props.items.length - 1))
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.dim} bold>
        {text(props.locale, 'files')}{' '}
        <Text color={theme.mute}>
          · @{props.query || '…'} · {text(props.locale, 'filesHint')}
        </Text>
      </Text>
      {props.loading ? (
        <Text color={theme.mute}>{text(props.locale, 'filesSearching')}</Text>
      ) : null}
      {props.items.map((item, index) => {
        const active = index === selected
        return (
          <Text key={item} color={active ? theme.text : theme.mute} inverse={active}>
            {active ? '›' : ' '} @{item}
          </Text>
        )
      })}
    </Box>
  )
}
