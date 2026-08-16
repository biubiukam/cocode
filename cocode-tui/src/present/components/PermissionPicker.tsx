import { Box, Text } from 'ink'
import {
  PERMISSION_PICKER_WINDOW_SIZE,
  type PermissionPickerState,
} from '../../runtime/permission-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

export function PermissionPicker(props: {
  state: PermissionPickerState
  locale: UiLocale
  maxRows?: number
}) {
  const visibleCount = props.state.modes.length
  const windowSize =
    props.maxRows === undefined
      ? PERMISSION_PICKER_WINDOW_SIZE
      : Math.max(1, Math.min(PERMISSION_PICKER_WINDOW_SIZE, Math.trunc(props.maxRows) - 6))
  const start = listWindowStart(props.state.selected, visibleCount, windowSize)
  const visible = props.state.modes.slice(start, start + windowSize)
  const above = start
  const below = Math.max(0, visibleCount - start - visible.length)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={PANEL_BORDER}
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'permissionTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'permissionHint')}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'permissionCurrent', { mode: props.state.current })}
      </Text>
      {above > 0 ? <Text color={theme.mute}>↑ {above}</Text> : null}
      {visible.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'permissionEmpty')}</Text>
      ) : (
        visible.map((mode, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          const pending = props.state.pending === mode
          return (
            <Text
              key={mode}
              {...selectionStyle(active)}
              wrap="truncate-end"
            >
              {active ? glyphs.optionActive : glyphs.optionInactive}{' '}
              <Text color={pending ? theme.warning : active ? theme.text : theme.dim}>
                {pending
                  ? glyphs.waitingMark
                  : mode === props.state.current
                  ? glyphs.checkDone
                  : ' '}
              </Text>{' '}
              {mode}
            </Text>
          )
        })
      )}
      {below > 0 ? <Text color={theme.mute}>↓ {below}</Text> : null}
      {props.state.pending !== undefined ? (
        <Text color={theme.warning} wrap="truncate-end">
          {text(props.locale, 'permissionApplying')}
        </Text>
      ) : null}
    </Box>
  )
}
