import { Box, Text } from 'ink'
import { REWIND_WINDOW_SIZE, type RewindPickerState } from '../../runtime/rewind-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'

export function BoundaryPicker(props: {
  state: RewindPickerState
  locale: UiLocale
  maxRows?: number
  titleKey: 'rewindTitle' | 'forkTitle'
  hintKey: 'rewindHint' | 'forkHint'
  confirmKey: 'rewindConfirm' | 'forkConfirm'
  emptyKey: 'rewindEmpty' | 'forkEmpty'
  formatItem?: (value: string) => string
}) {
  const windowSize =
    props.maxRows === undefined
      ? REWIND_WINDOW_SIZE
      : Math.max(1, Math.min(REWIND_WINDOW_SIZE, Math.trunc(props.maxRows) - 6))
  const start = listWindowStart(props.state.selected, props.state.items.length, windowSize)
  const visible = props.state.items.slice(start, start + windowSize)
  const formatItem = props.formatItem ?? ((value: string) => value.replaceAll('\n', ' ↵ '))

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={props.state.confirming ? theme.accent : theme.brand}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, props.titleKey)}{' '}
        <Text color={theme.mute}>· {text(props.locale, props.hintKey)}</Text>
      </Text>
      {props.state.confirming ? (
        <Text color={theme.accent} wrap="truncate-end">
          {text(props.locale, props.confirmKey)}
        </Text>
      ) : null}
      {start > 0 ? <Text color={theme.mute}>↑ {start}</Text> : null}
      {visible.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, props.emptyKey)}</Text>
      ) : (
        visible.map((item, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          return (
            <Text
              key={`${item.id}:${item.seq}`}
              color={active ? theme.text : theme.mute}
              inverse={active}
              wrap="truncate-end"
            >
              {active ? '›' : ' '} {formatItem(item.text)}
            </Text>
          )
        })
      )}
      {props.state.items.length - start - visible.length > 0 ? (
        <Text color={theme.mute}>↓ {props.state.items.length - start - visible.length}</Text>
      ) : null}
    </Box>
  )
}
