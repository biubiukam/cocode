import { Box, Text } from 'ink'
import type { ConversationNode } from '../../runtime/nodes/types.ts'
import { nodeKey } from '../../runtime/nodes/types.ts'
import { visibleTail } from '../visible-tail.ts'
import { renderNode } from '../nodes.tsx'
import { theme } from '../theme.ts'

export function MessageList(props: {
  nodes: readonly ConversationNode[]
  verbose: boolean
  maxRows?: number
  selectedNodeId?: string | null
  expandedNodeIds?: ReadonlySet<string>
}) {
  const nodes =
    props.maxRows === undefined
      ? props.nodes
      : visibleTail(props.nodes, props.maxRows, props.verbose, props.expandedNodeIds)
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      height={props.maxRows}
      overflowY={props.maxRows === undefined ? 'visible' : 'hidden'}
    >
      {nodes.map((node) => {
        const key = nodeKey(node.kind, node.id)
        const selected = props.selectedNodeId === key
        const expanded = props.expandedNodeIds?.has(key) === true
        return (
          <Box key={`${node.kind}:${node.id}`}>
            {props.selectedNodeId !== undefined ? (
              <Text color={selected ? theme.brand : theme.mute}>{selected ? '› ' : '  '}</Text>
            ) : null}
            {renderNode(node, props.verbose, { expanded })}
          </Box>
        )
      })}
    </Box>
  )
}
