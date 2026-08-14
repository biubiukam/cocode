import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { theme } from '../theme.ts'

export function Composer(props: { composer: TuiSnapshot['composer'] }) {
  const { composer } = props
  const empty = composer.text === ''
  const rows = empty ? [] : renderRows(composer.text, composer.cursor)
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={composer.disabled ? theme.border : theme.brand}
      paddingX={1}
    >
      <Box width="100%" justifyContent="space-between">
        <Text color={composer.disabled ? theme.mute : theme.brand} bold>
          {composer.mask ? 'secret' : 'prompt'}
        </Text>
        <Text color={theme.mute}>{composer.disabled ? 'locked' : 'enter to send'}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {empty ? (
          <Box>
            <Text color={composer.disabled ? theme.mute : theme.brand}>{'> '}</Text>
            <Text color={theme.mute}>{composer.placeholder}</Text>
          </Box>
        ) : (
          rows.map((row, index) => (
            <Box key={index}>
              <Text color={composer.disabled ? theme.mute : theme.brand}>
                {index === 0 ? '> ' : '  '}
              </Text>
              <Text color={composer.disabled ? theme.mute : theme.text}>{row.before}</Text>
              <Text inverse color={composer.disabled ? theme.mute : theme.text}>
                {row.cursor}
              </Text>
              <Text color={composer.disabled ? theme.mute : theme.text}>{row.after}</Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}

function renderRows(
  text: string,
  cursor: number,
): Array<{
  before: string
  cursor: string
  after: string
}> {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const rows: Array<{ before: string; cursor: string; after: string }> = []
  let cursorRendered = false
  let offset = 0
  for (const line of text.split('\n')) {
    const lineEnd = offset + line.length
    if (!cursorRendered && safeCursor <= lineEnd) {
      const position = safeCursor - offset
      rows.push({
        before: line.slice(0, position),
        cursor: line[position] ?? ' ',
        after: line.slice(position + (position < line.length ? 1 : 0)),
      })
      cursorRendered = true
    } else {
      rows.push({ before: line, cursor: ' ', after: '' })
    }
    offset = lineEnd + 1
  }
  return rows
}
