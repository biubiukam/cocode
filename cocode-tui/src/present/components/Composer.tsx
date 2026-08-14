import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { formatFileMention } from '../../runtime/file-mentions.ts'
import { clipComposerRow, renderComposerRows, visibleComposerRows } from '../composer-layout.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function Composer(props: {
  composer: TuiSnapshot['composer']
  locale: UiLocale
  maxRows?: number
  maxColumns?: number
}) {
  const { composer } = props
  const empty = composer.text === ''
  const rows = empty
    ? []
    : visibleComposerRows(
        renderComposerRows(composer.text, composer.cursor),
        props.maxRows ?? 6,
      ).map((row) => clipComposerRow(row, Math.max(1, (props.maxColumns ?? 80) - 6)))
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={composer.disabled ? theme.border : theme.brand}
      paddingX={1}
    >
      <Box width="100%" justifyContent="space-between">
        <Text color={composer.disabled ? theme.mute : theme.brand} bold>
          {composer.mask ? text(props.locale, 'secret') : text(props.locale, 'prompt')}
        </Text>
        <Text color={theme.mute}>
          {composer.disabled ? text(props.locale, 'locked') : text(props.locale, 'send')}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {empty ? (
          <Box>
            <Text color={composer.disabled ? theme.mute : theme.brand}>{'> '}</Text>
            <Text color={theme.mute} wrap="truncate-end">
              {composer.placeholder}
            </Text>
          </Box>
        ) : (
          rows.map((row, index) => (
            <Box key={index} width="100%" height={1} overflowY="hidden">
              <Text color={composer.disabled ? theme.mute : theme.brand}>
                {index === 0 ? '> ' : '  '}
              </Text>
              <Text color={composer.disabled ? theme.mute : theme.text}>{row.before}</Text>
              {row.cursor === undefined ? null : (
                <Text
                  inverse={!composer.disabled}
                  color={composer.disabled ? theme.mute : theme.text}
                >
                  {row.cursor}
                </Text>
              )}
              <Text color={composer.disabled ? theme.mute : theme.text}>{row.after}</Text>
            </Box>
          ))
        )}
      </Box>
      {composer.attachments.length > 0 ? (
        <Text color={theme.info} wrap="truncate-end">
          {text(props.locale, 'attached')} ·{' '}
          {composer.attachments.map(formatFileMention).join(' · ')}
        </Text>
      ) : null}
    </Box>
  )
}
