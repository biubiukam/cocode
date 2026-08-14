import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { theme } from '../theme.ts'

export function Composer(props: { composer: TuiSnapshot['composer'] }) {
  const { composer } = props
  const empty = composer.text === ''
  const rows = empty ? [] : renderRows(composer.text, composer.cursor)
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.brand}>{'> '}</Text>
        {empty ? <Text color={theme.mute}>{composer.placeholder}</Text> : null}
      </Box>
      {rows.map((row, index) => (
        <Box key={index}>
          <Text color={theme.brand}>{index === 0 ? '> ' : '  '}</Text>
          <Text color={theme.text}>{row.before}</Text>
          <Text inverse color={theme.text}>
            {row.cursor}
          </Text>
          <Text color={theme.text}>{row.after}</Text>
        </Box>
      ))}
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
  let offset = 0
  for (const line of text.split('\n')) {
    const lineEnd = offset + line.length
    if (safeCursor <= lineEnd) {
      const position = safeCursor - offset
      rows.push({
        before: line.slice(0, position),
        cursor: line[position] ?? ' ',
        after: line.slice(position + (position < line.length ? 1 : 0)),
      })
    } else {
      rows.push({ before: line, cursor: ' ', after: '' })
    }
    offset = lineEnd + 1
  }
  return rows
}
