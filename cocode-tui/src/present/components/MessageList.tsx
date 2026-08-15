import { Box, Text } from 'ink'
import type { ConversationNode } from '../../runtime/nodes/types.ts'
import { nodeKey } from '../../runtime/nodes/types.ts'
import { visibleMessageWindow } from '../message-scroll.ts'
import { renderNode } from '../nodes.tsx'
import { theme } from '../theme.ts'
import { EmptyState } from './EmptyState.tsx'
import type { UiLocale } from '../../runtime/ui-locale.ts'

export function MessageList(props: {
  nodes: readonly ConversationNode[]
  verbose: boolean
  maxRows?: number
  scrollOffset?: number
  selectedNodeId?: string | null
  expandedNodeIds?: ReadonlySet<string>
  locale: UiLocale
  maxColumns?: number
}) {
  const nodes =
    props.maxRows === undefined
      ? props.nodes
      : visibleMessageWindow(
          props.nodes,
          props.maxRows,
          props.verbose,
          props.expandedNodeIds,
          props.scrollOffset,
        )
  const contentColumns =
    props.maxColumns === undefined
      ? undefined
      : Math.max(1, props.maxColumns - (props.selectedNodeId !== undefined ? 2 : 0))
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      height={props.maxRows}
      overflowY={props.maxRows === undefined ? 'visible' : 'hidden'}
    >
      {nodes.length === 0 && props.nodes.length === 0 ? (
        <EmptyState maxRows={props.maxRows} maxColumns={props.maxColumns} locale={props.locale} />
      ) : (
        nodes.map((node) => {
          const key = nodeKey(node.kind, node.id)
          const selected = props.selectedNodeId === key
          const expanded = props.expandedNodeIds?.has(key) === true
          return (
            <Box key={`${node.kind}:${node.id}`} alignItems="flex-start">
              {props.selectedNodeId !== undefined ? (
                <Box marginTop={1}>
                  <Text color={selected ? theme.brand : theme.mute}>{selected ? '› ' : '  '}</Text>
                </Box>
              ) : null}
              <Box flexDirection="column" flexGrow={1} minWidth={0}>
                {renderNode(node, props.verbose, {
                  expanded,
                  locale: props.locale,
                  maxColumns: contentColumns,
                })}
              </Box>
            </Box>
          )
        })
      )}
    </Box>
  )
}
