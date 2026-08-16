import { Box, type BoxProps } from 'ink'
import type { ReactNode } from 'react'
import { glyphs } from '../glyphs.ts'
import { BLOCK_GAP, BODY_INDENT } from '../layout.ts'

/**
 * The vertical line running down the left of a message and the tools it called.
 *
 * Drawn as a left-only box border rather than a rail character, because a
 * single character covers one row while a reply wraps to many; the border spans
 * whatever height the content ends up with.
 */
export function MessageRail(props: {
  color: string
  emphasis?: boolean
  /** Continues the previous row's turn: no gap, so the rail stays unbroken. */
  attached?: boolean
  width?: number
  children: ReactNode
}) {
  return (
    <Box
      flexDirection="column"
      marginTop={props.attached === true ? 0 : BLOCK_GAP}
      width={props.width}
      minWidth={0}
      // An empty message still belongs to the thread, so the rail keeps one row
      // instead of collapsing with its content.
      minHeight={1}
      borderStyle={railStyle(props.emphasis === true ? glyphs.railSelected : glyphs.rail)}
      borderColor={props.color}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      paddingLeft={BODY_INDENT}
    >
      {props.children}
    </Box>
  )
}

/** Only the left edge is drawn, so every other slot repeats the same glyph. */
function railStyle(character: string): BoxProps['borderStyle'] {
  return {
    topLeft: character,
    top: character,
    topRight: character,
    left: character,
    right: character,
    bottomLeft: character,
    bottom: character,
    bottomRight: character,
  }
}
