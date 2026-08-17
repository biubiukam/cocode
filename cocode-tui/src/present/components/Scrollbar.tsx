import { Box, Text } from 'ink'
import { glyphs } from '../glyphs.ts'
import { theme } from '../theme.ts'
import type { ScrollbarThumb } from '../scrollbar.ts'

export function Scrollbar(props: ScrollbarThumb & { height: number }) {
  const height = Math.max(1, Math.trunc(props.height))
  const rows: string[] = []
  for (let row = 0; row < height; row += 1) {
    const inThumb = row >= props.start && row < props.start + props.size
    rows.push(inThumb ? glyphs.scrollThumb : glyphs.scrollTrack)
  }
  return (
    <Box flexDirection="column" width={1} height={height} flexShrink={0}>
      {rows.map((character, row) => (
        <Text key={row} color={character === glyphs.scrollThumb ? theme.dim : theme.mute}>
          {character}
        </Text>
      ))}
    </Box>
  )
}
