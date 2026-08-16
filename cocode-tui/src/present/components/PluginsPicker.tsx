import { Box, Text } from 'ink'
import {
  PLUGIN_PICKER_WINDOW_SIZE,
  pluginPhaseLabel,
  visiblePlugins,
  type PluginPickerState,
} from '../../runtime/plugin-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

export function PluginsPicker(props: {
  state: PluginPickerState
  locale: UiLocale
  maxRows?: number
}) {
  const items = visiblePlugins(props.state)
  const windowSize =
    props.maxRows === undefined
      ? PLUGIN_PICKER_WINDOW_SIZE
      : Math.max(1, Math.min(PLUGIN_PICKER_WINDOW_SIZE, Math.trunc(props.maxRows) - 7))
  const start = listWindowStart(props.state.selected, items.length, windowSize)
  const visible = items.slice(start, start + windowSize)
  const above = start
  const below = Math.max(0, items.length - start - visible.length)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={PANEL_BORDER}
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'pluginsTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'pluginsHint')}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'pluginsQuery', { query: props.state.query || '…' })}
      </Text>
      {above > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">↑ {above}</Text>
      ) : null}
      {visible.length === 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'pluginsEmpty')}
        </Text>
      ) : (
        visible.map((plugin, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          const pending = props.state.pendingEntryId === plugin.entryId
          const stateLabel = pending
            ? text(props.locale, 'pluginsToggling')
            : plugin.enabled
              ? text(props.locale, 'pluginsEnabled')
              : text(props.locale, 'pluginsDisabled')
          const stateIcon = pending
            ? glyphs.waitingMark
            : plugin.enabled
            ? glyphs.checkDone
            : glyphs.canceledMark
          return (
            <Text
              key={plugin.entryId}
              {...selectionStyle(active)}
              wrap="truncate-end"
            >
              {active ? glyphs.optionActive : glyphs.optionInactive}{' '}
              <Text color={pending ? theme.warning : plugin.enabled ? theme.success : theme.mute}>
                {stateIcon}
              </Text>{' '}
              {plugin.moduleName}{' '}
              <Text color={active ? theme.text : theme.dim}>
                · {plugin.entryId} · {stateLabel} · {pluginPhaseLabel(plugin.fiberPhase, props.locale)}
              </Text>
            </Text>
          )
        })
      )}
      {below > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">↓ {below}</Text>
      ) : null}
      {props.state.status !== undefined ? (
        <Text
          color={props.state.status.tone === 'error' ? theme.danger : theme.accent}
          wrap="truncate-end"
        >
          {props.state.status.message}
        </Text>
      ) : null}
    </Box>
  )
}
