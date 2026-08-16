import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { theme } from '../theme.ts'

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
      marginTop={1}
      borderStyle="round"
      borderColor={props.borderColor ?? theme.brand}
      paddingX={1}
    >
      <Text color={theme.brand} bold wrap="truncate-end">
        <Text color={theme.accent}>{props.titleIcon ?? '◆'}</Text> {props.title}
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
