import { Box, Text } from 'ink'
import type { AssistantNode } from '../../runtime/nodes/types.ts'
import { formatReasoning } from '../text-format.ts'
import { theme } from '../theme.ts'

export function AssistantRow(props: { node: AssistantNode; verbose: boolean }) {
  const { node, verbose } = props
  const reasoning = formatReasoning(node.reasoning, verbose, node.streaming)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.brand}>{node.streaming ? 'cocode …' : 'cocode'}</Text>
      {reasoning !== undefined ? (
        <Text color={theme.mute} italic>
          {reasoning}
        </Text>
      ) : null}
      {node.text !== '' ? <Text color={theme.assistant}>{node.text}</Text> : null}
    </Box>
  )
}
