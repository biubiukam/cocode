import { Box, Text } from 'ink'
import type { ConversationNode } from '../../runtime/nodes/types.ts'
import { nodeKey } from '../../runtime/nodes/types.ts'
import { resolveMessageWindow } from '../message-scroll.ts'
import { glyphs } from '../glyphs.ts'
import { renderNode } from '../nodes.tsx'
import { theme } from '../theme.ts'
import { EmptyState } from './EmptyState.tsx'
import type { UiLocale } from '../../runtime/ui-locale.ts'

/** Kinds drawn inside a MessageRail, which handles their own indent and selection. */
function hasRail(kind: string | undefined): boolean {
  return kind === 'user' || kind === 'assistant' || kind === 'tool'
}

export function MessageList(props: {
  nodes: readonly ConversationNode[]
  verbose: boolean
  maxRows?: number
  scrollOffset?: number
  selectedNodeId?: string | null
  expandedNodeIds?: ReadonlySet<string>
  expandedNodeLevels?: ReadonlyMap<string, 0 | 1 | 2>
  locale: UiLocale
  maxColumns?: number
}) {
  const contentColumns =
    props.maxColumns === undefined
      ? undefined
      : Math.max(1, props.maxColumns - (props.selectedNodeId !== undefined ? 2 : 0))
  const visibleNodes = props.nodes.filter((node) => {
    const expanded = props.expandedNodeIds?.has(nodeKey(node.kind, node.id)) === true
    if (node.kind === 'context') return props.verbose || expanded
    if (node.kind === 'notice' && node.verboseOnly === true) return props.verbose
    return true
  })
  const window =
    props.maxRows === undefined
      ? { nodes: visibleNodes, hiddenRowsBefore: 0 }
      : resolveMessageWindow(
          visibleNodes,
          props.maxRows,
          props.verbose,
          props.expandedNodeIds,
          props.scrollOffset,
          contentColumns,
        )
  const nodes = window.nodes
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      height={props.maxRows}
      overflowY={props.maxRows === undefined ? 'visible' : 'hidden'}
    >
      {nodes.length === 0 ? (
        <EmptyState maxRows={props.maxRows} maxColumns={props.maxColumns} locale={props.locale} />
      ) : (
        <Box
          flexDirection="column"
          width="100%"
          marginTop={-window.hiddenRowsBefore}
        >
          {nodes.map((node, index) => {
            const key = nodeKey(node.kind, node.id)
            const selected = props.selectedNodeId === key
            const expanded = props.expandedNodeIds?.has(key) === true
            const railed = hasRail(node.kind)
            // A tool follows the reply that called it, so the two share one rail.
            const attached = node.kind === 'tool' && hasRail(nodes[index - 1]?.kind)
            return (
              <Box
                key={`${node.kind}:${node.id}`}
                alignItems="flex-start"
              >
                {/* Railed rows show selection through the rail itself; the rest
                    need a marker column. */}
                {props.selectedNodeId !== undefined && !railed ? (
                  <Box marginTop={1}>
                    <Text color={selected ? theme.accent : theme.mute}>
                      {selected ? `${glyphs.optionActive} ` : '  '}
                    </Text>
                  </Box>
                ) : null}
                <Box flexDirection="column" flexGrow={1} minWidth={0}>
                  {renderNode(node, props.verbose, {
                    expanded,
                    expandedLevel: props.expandedNodeLevels?.get(key),
                    selected,
                    attached,
                    locale: props.locale,
                    maxColumns: railed ? props.maxColumns : contentColumns,
                  })}
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
