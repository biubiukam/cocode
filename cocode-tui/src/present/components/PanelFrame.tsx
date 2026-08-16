import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { glyphs } from '../glyphs.ts'
import { BLOCK_GAP, PANEL_BORDER, PANEL_PADDING_X } from '../layout.ts'
import { theme } from '../theme.ts'

/**
 * Panels default to a neutral border. A colored border is a signal, not
 * decoration: when every panel is tinted the tint stops meaning anything, so
 * callers pass `borderColor` only for panels that demand attention (approval,
 * destructive confirmation, failure).
 */
export function PanelFrame(props: {
  title: string
  hint?: string
  children: ReactNode
  footer?: string
  borderColor?: string
  titleIcon?: string
}) {
  return (
    <Box
      flexDirection="column"
      marginTop={BLOCK_GAP}
      borderStyle={PANEL_BORDER}
      borderColor={props.borderColor ?? theme.border}
      paddingX={PANEL_PADDING_X}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        <Text color={theme.mute}>{props.titleIcon ?? glyphs.panelMark}</Text> {props.title}
        {props.hint !== undefined ? <Text color={theme.mute}> · {props.hint}</Text> : null}
      </Text>
      {props.children}
      {props.footer !== undefined ? (
        <Text color={theme.mute} wrap="truncate-end">
          {props.footer}
        </Text>
      ) : null}
    </Box>
  )
}
