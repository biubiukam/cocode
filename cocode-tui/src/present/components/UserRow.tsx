import { Box, Text } from 'ink'
import type { UserNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'

export function UserRow(props: { node: UserNode }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.brand} bold>
        you <Text color={theme.mute}>· prompt</Text>
      </Text>
      <Text color={theme.user}> {props.node.text}</Text>
    </Box>
  )
}
