import { Box, Text } from 'ink'
import { REWIND_WINDOW_SIZE, type RewindPickerState } from '../../runtime/rewind-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'

export function RewindPicker(props: {
  state: RewindPickerState
  locale: UiLocale
  maxRows?: number
}) {
  const windowSize =
    props.maxRows === undefined
      ? REWIND_WINDOW_SIZE
      : Math.max(1, Math.min(REWIND_WINDOW_SIZE, Math.trunc(props.maxRows) - 6))
  const start = listWindowStart(props.state.selected, props.state.items.length, windowSize)
  const visible = props.state.items.slice(start, start + windowSize)
  const above = start
  const below = Math.max(0, props.state.items.length - start - visible.length)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={props.state.confirming ? theme.accent : theme.brand}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'rewindTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'rewindHint')}</Text>
      </Text>
      {props.state.confirming ? (
        <Text color={theme.accent} wrap="truncate-end">
          {text(props.locale, 'rewindConfirm')}
        </Text>
      ) : null}
      {above > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          ↑ {above}
        </Text>
      ) : null}
      {visible.length === 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'rewindEmpty')}
        </Text>
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
              {active ? '›' : ' '} {item.text.replaceAll('\n', ' ↵ ')}
            </Text>
          )
        })
      )}
      {below > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          ↓ {below}
        </Text>
      ) : null}
    </Box>
  )
}
