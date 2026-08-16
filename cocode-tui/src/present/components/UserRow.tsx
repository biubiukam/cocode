import { Box, Text } from 'ink'
import type { UserNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { assistantContentColumns } from '../assistant-layout.ts'

export function UserRow(props: {
  node: UserNode
  locale?: UiLocale
  maxColumns?: number
  selected?: boolean
  expandedLevel?: 0 | 1 | 2
}) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      width={props.maxColumns}
    >
      <Box flexDirection="row" minWidth={0}>
        <Text color={theme.brand}>
          {props.selected ? '▌' : '│'}
        </Text>
        <Box
          flexDirection="column"
          paddingLeft={1}
          minWidth={0}
          width={assistantContentColumns(props.maxColumns)}
        >
          <Text color={theme.user} wrap="wrap">{props.node.text}</Text>
        </Box>
      </Box>
    </Box>
  )
}
