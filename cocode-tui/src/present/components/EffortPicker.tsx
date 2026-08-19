import { Box, Text } from 'ink'
import {
  EFFORT_PICKER_WINDOW_SIZE,
  type EffortPickerState,
} from '../../runtime/effort-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

export function EffortPicker(props: {
  state: EffortPickerState
  locale: UiLocale
  maxRows?: number
}) {
  const visibleCount = props.state.items.length
  const windowSize =
    props.maxRows === undefined
      ? EFFORT_PICKER_WINDOW_SIZE
      : Math.max(1, Math.min(EFFORT_PICKER_WINDOW_SIZE, Math.trunc(props.maxRows) - 6))
  const start = listWindowStart(props.state.selected, visibleCount, windowSize)
  const visible = props.state.items.slice(start, start + windowSize)
  const above = start
  const below = Math.max(0, visibleCount - start - visible.length)
  const currentLabel = effortLabel(props.state, props.locale, props.state.current)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={PANEL_BORDER}
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'effortTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'effortHint')}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'effortCurrent', {
          effort: currentLabel ?? text(props.locale, 'effortDefault'),
        })}
      </Text>
      {above > 0 ? <Text color={theme.mute}>↑ {above}</Text> : null}
      {visible.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'effortEmpty')}</Text>
      ) : (
        visible.map((item, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          const pending = props.state.pending !== undefined
            && props.state.pending === (item.effort ?? null)
          const label = item.effort === undefined
            ? text(props.locale, 'effortDefault')
            : item.label
          return (
            <Text
              key={item.key}
              {...selectionStyle(active)}
              wrap="truncate-end"
            >
              {active ? glyphs.optionActive : glyphs.optionInactive}{' '}
              <Text color={pending ? theme.warning : active ? theme.text : theme.dim}>
                {pending
                  ? glyphs.waitingMark
                  : item.effort === props.state.current
                  ? glyphs.checkDone
                  : ' '}
              </Text>{' '}
              {label}
              {item.description === undefined ? null : (
                <Text color={active ? theme.text : theme.dim}> · {item.description}</Text>
              )}
            </Text>
          )
        })
      )}
      {below > 0 ? <Text color={theme.mute}>↓ {below}</Text> : null}
      {props.state.pending !== undefined ? (
        <Text color={theme.warning} wrap="truncate-end">
          {text(props.locale, 'effortApplying')}
        </Text>
      ) : null}
    </Box>
  )
}

function effortLabel(
  state: EffortPickerState,
  locale: UiLocale,
  effort: string | undefined,
): string | undefined {
  if (effort === undefined) return undefined
  const item = state.items.find((choice) => choice.effort === effort)
  if (item === undefined) return effort
  return item.effort === undefined ? text(locale, 'effortDefault') : item.label
}
