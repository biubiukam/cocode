import { Box } from 'ink'
import type { ConversationNode } from '../../runtime/nodes/types.ts'
import { visibleTail } from '../visible-tail.ts'
import { renderNode } from '../nodes.tsx'

export function MessageList(props: {
  nodes: readonly ConversationNode[]
  verbose: boolean
  maxRows?: number
}) {
  const nodes =
    props.maxRows === undefined
      ? props.nodes
      : visibleTail(props.nodes, props.maxRows, props.verbose)
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      height={props.maxRows}
      overflowY={props.maxRows === undefined ? 'visible' : 'hidden'}
    >
      {nodes.map((node) => (
        <Box key={`${node.kind}:${node.id}`}>{renderNode(node, props.verbose)}</Box>
      ))}
    </Box>
  )
}
