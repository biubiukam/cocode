import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { formatFileMention } from '../../runtime/file-mentions.ts'
import { isAppleTerminalEnvironment } from '../../runtime/platform.ts'
import {
  clipComposerRow,
  composerCursorStyle,
  renderComposerRows,
  visibleComposerRows,
} from '../composer-layout.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import {
  COMPOSER_META_SEPARATOR,
  COMPOSER_ROUTE_SEPARATOR,
  composerHeaderLayout,
} from '../composer-header.ts'

export function Composer(props: {
  composer: TuiSnapshot['composer']
  agent: TuiSnapshot['agent']
  planMode: boolean
  planModeAvailable: boolean
  provider: string
  model: string
  locale: UiLocale
  maxRows?: number
  maxColumns?: number
}) {
  const { composer } = props
  const cursorStyle = composerCursorStyle(isAppleTerminalEnvironment(), composer.disabled)
  const empty = composer.text === ''
  const header = composerHeaderLayout({
    composer,
    agent: props.agent,
    planMode: props.planMode,
    planModeAvailable: props.planModeAvailable,
    locale: props.locale,
    provider: props.provider,
    model: props.model,
    columns: props.maxColumns,
  })
  const titleColor = !composer.mask && props.planMode ? theme.info : theme.brand
  const rows = empty
    ? []
    : visibleComposerRows(
        renderComposerRows(composer.text, composer.cursor, composer.selection),
        props.maxRows ?? 6,
      ).map((row) => clipComposerRow(row, Math.max(1, (props.maxColumns ?? 80) - 2)))
  return (
    <Box flexDirection="column" width="100%">
      {/* Keep all non-editable chrome above the draft: the terminal's real cursor
          is left on the final draft row so native IME candidates anchor there. */}
      {composer.attachments.length > 0 ? (
        <Text color={theme.info} wrap="truncate-end">
          {text(props.locale, 'attached')} ·{' '}
          {composer.attachments.map(formatFileMention).join(' · ')}
        </Text>
      ) : null}
      {composer.images.length > 0 ? (
        <Text color={theme.info} wrap="truncate-end">
          image · {composer.images.map((image) => image.name).join(' · ')}
        </Text>
      ) : null}
      <Box width="100%" height={1} overflowY="hidden" justifyContent="space-between">
        <Box minWidth={0} flexShrink={1} height={1} overflowY="hidden">
          <Box flexShrink={0}>
            <Text color={composer.disabled ? theme.mute : titleColor} bold>
              {header.title}
            </Text>
          </Box>
          {header.showRoute ? (
            <>
              <Box flexShrink={0}>
                <Text color={theme.mute}>{COMPOSER_META_SEPARATOR}</Text>
              </Box>
              {!header.compact ? (
                <>
                  <Box flexShrink={0}>
                    <Text color={composer.disabled ? theme.mute : theme.dim}>
                      {props.provider}
                    </Text>
                  </Box>
                  <Box flexShrink={0}>
                    <Text color={theme.mute}>{COMPOSER_ROUTE_SEPARATOR}</Text>
                  </Box>
                </>
              ) : null}
              <Box minWidth={0} flexShrink={1}>
                <Text
                  color={composer.disabled ? theme.mute : theme.brand}
                  underline={!composer.disabled}
                  wrap="truncate-end"
                >
                  {props.model}
                </Text>
              </Box>
            </>
          ) : null}
        </Box>
        {header.hint === '' ? null : (
          <Text color={theme.mute} wrap="truncate-end">
            {header.hint}
          </Text>
        )}
      </Box>
      <Box flexDirection="column">
        {empty ? (
          <Box width="100%" height={1} overflowY="hidden">
            <Text color={composer.disabled ? theme.mute : theme.brand}>{'> '}</Text>
            <Text color={theme.mute} wrap="truncate-end">
              {composer.placeholder}
            </Text>
          </Box>
        ) : (
          rows.map((row, index) => (
            <Box key={index} width="100%" height={1} overflowY="hidden">
              <Text color={composer.disabled ? theme.mute : theme.brand}>
                {index === 0 ? '> ' : '│ '}
              </Text>
              {row.spans.map((span, spanIndex) => (
                <Text
                  key={`${spanIndex}:${span.text}`}
                  inverse={cursorStyle.inverse && span.cursor === true}
                  underline={cursorStyle.underline && span.cursor === true}
                  color={composer.disabled ? theme.mute : theme.text}
                  backgroundColor={
                    !composer.disabled && span.selected === true ? theme.border : undefined
                  }
                >
                  {span.text}
                </Text>
              ))}
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}
