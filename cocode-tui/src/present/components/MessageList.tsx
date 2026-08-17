import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import type { ConversationNode } from '../../runtime/nodes/types.ts'
import { nodeKey } from '../../runtime/nodes/types.ts'
import {
  maxMessageScrollOffset,
  transcriptPaintColumns,
} from '../message-scroll.ts'
import { cachedNodeRows, measureTranscript } from '../transcript-layout.ts'
import { glyphs } from '../glyphs.ts'
import { renderNode } from '../nodes.tsx'
import { scrollbarThumb } from '../scrollbar.ts'
import { nodeAttached } from '../visible-tail.ts'
import { theme } from '../theme.ts'
import { EmptyState } from './EmptyState.tsx'
import { Scrollbar } from './Scrollbar.tsx'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import type { MessageTextSelection } from '../message-text-selection.ts'
import { textRangeForMessage } from '../message-text-selection.ts'

/** Kinds drawn inside a MessageRail, which handles their own indent and selection. */
function hasRail(kind: string | undefined): boolean {
  return kind === 'user' || kind === 'assistant' || kind === 'tool'
}

/** Clip window nodes so their slots never exceed the transcript budget. */
function slotHeights(
  nodes: readonly ConversationNode[],
  visibleNodes: readonly ConversationNode[],
  windowStartIndex: number,
  hiddenRowsBefore: number,
  maxRows: number | undefined,
  verbose: boolean,
  expandedNodeIds: ReadonlySet<string> | undefined,
  paintColumns: number | undefined,
  contentColumns: number | undefined,
): readonly { slot: number | undefined; skip: number }[] {
  let used = 0
  return nodes.map((node, index) => {
    const railed = hasRail(node.kind)
    const estimated = cachedNodeRows(
      node,
      verbose,
      expandedNodeIds?.has(nodeKey(node.kind, node.id)) === true,
      railed ? paintColumns : contentColumns,
      nodeAttached(visibleNodes, windowStartIndex + index),
    )
    const topSkip = index === 0 ? hiddenRowsBefore : 0
    const natural = Math.max(0, estimated - topSkip)
    if (maxRows === undefined) return { slot: undefined, skip: topSkip }
    const slot = Math.min(natural, Math.max(0, maxRows - used))
    // Only the first window node is top-clipped; later overflow is bottom-clipped.
    used += slot
    return { slot, skip: topSkip }
  })
}

/** Keep each node in its estimated rows so Yoga cannot stack two paints. */
function clipNodeSlot(options: {
  key: string
  skip: number
  slot: number | undefined
  children: ReactNode
}) {
  if (options.slot === 0) return null
  const locked = options.slot !== undefined
  return (
    <Box
      key={options.key}
      flexDirection="column"
      width="100%"
      height={options.slot}
      minHeight={locked ? 0 : undefined}
      maxHeight={options.slot}
      overflowY={locked ? 'hidden' : 'visible'}
      flexShrink={locked ? 0 : 1}
    >
      <Box flexShrink={0} marginTop={-options.skip}>
        {options.children}
      </Box>
    </Box>
  )
}

export function MessageList(props: {
  nodes: readonly ConversationNode[]
  verbose: boolean
  maxRows?: number
  scrollOffset?: number
  selectedNodeId?: string | null
  textSelection?: MessageTextSelection
  expandedNodeIds?: ReadonlySet<string>
  expandedNodeLevels?: ReadonlyMap<string, 0 | 1 | 2>
  locale: UiLocale
  maxColumns?: number
}) {
  const visibleNodes = props.nodes.filter((node) => {
    const expanded =
      props.expandedNodeIds?.has(nodeKey(node.kind, node.id)) === true
    if (node.kind === 'context') return props.verbose || expanded
    if (node.kind === 'notice' && node.verboseOnly === true)
      return props.verbose
    return true
  })
  const selectedNode = visibleNodes.find(
    (node) => props.selectedNodeId === nodeKey(node.kind, node.id),
  )
  const paintColumns =
    props.maxRows === undefined
      ? props.maxColumns
      : transcriptPaintColumns(
          visibleNodes,
          props.maxRows,
          props.verbose,
          props.expandedNodeIds,
          props.maxColumns,
        )
  const contentColumns =
    paintColumns === undefined
      ? undefined
      : Math.max(
          1,
          paintColumns -
            (selectedNode !== undefined && !hasRail(selectedNode.kind) ? 2 : 0),
        )
  const window =
    props.maxRows === undefined
      ? { nodes: visibleNodes, startIndex: 0, hiddenRowsBefore: 0 }
      : measureTranscript({
          nodes: visibleNodes,
          maxRows: props.maxRows,
          verbose: props.verbose,
          expandedNodeIds: props.expandedNodeIds,
          maxColumns: contentColumns,
          scrollOffset: props.scrollOffset,
        }).window
  const nodes = window.nodes
  const windowStartIndex = window.startIndex
  const nodeSlots = slotHeights(
    nodes,
    visibleNodes,
    windowStartIndex,
    window.hiddenRowsBefore,
    props.maxRows,
    props.verbose,
    props.expandedNodeIds,
    paintColumns,
    contentColumns,
  )
  const thumb =
    props.maxRows === undefined
      ? undefined
      : scrollbarThumb({
          trackRows: props.maxRows,
          contentRows:
            props.maxRows +
            maxMessageScrollOffset(
              visibleNodes,
              props.maxRows,
              props.verbose,
              props.expandedNodeIds,
              paintColumns,
            ),
          scrollOffset: props.scrollOffset ?? 0,
        })
  return (
    <Box
      flexDirection="row"
      width="100%"
      flexGrow={1}
      minHeight={0}
      height={props.maxRows}
      maxHeight={props.maxRows}
      overflowY={props.maxRows === undefined ? 'visible' : 'hidden'}
    >
      <Box
        flexDirection="column"
        flexGrow={1}
        minWidth={0}
        minHeight={0}
        height={props.maxRows}
        maxHeight={props.maxRows}
        overflowY={props.maxRows === undefined ? 'visible' : 'hidden'}
      >
        {nodes.length === 0 ? (
          <EmptyState
            maxRows={props.maxRows}
            maxColumns={props.maxColumns}
            locale={props.locale}
          />
        ) : (
          <Box flexDirection="column" width="100%">
            {nodes.map((node, index) => {
              const key = nodeKey(node.kind, node.id)
              const selected = props.selectedNodeId === key
              const expanded = props.expandedNodeIds?.has(key) === true
              const railed = hasRail(node.kind)
              // A tool follows the reply that called it, so the two share one rail.
              const attached = nodeAttached(
                visibleNodes,
                windowStartIndex + index,
              )
              const columns = railed ? paintColumns : contentColumns
              const slot = nodeSlots[index]?.slot
              const skip = nodeSlots[index]?.skip ?? 0
              const body = renderNode(node, props.verbose, {
                expanded,
                expandedLevel: props.expandedNodeLevels?.get(key),
                selected,
                attached,
                locale: props.locale,
                maxColumns: columns,
                textSelection: textRangeForMessage(
                  props.nodes,
                  props.textSelection,
                  key,
                  {
                    verbose: props.verbose,
                    expandedNodeIds: props.expandedNodeIds,
                    locale: props.locale,
                    maxColumns: columns,
                  },
                ),
              })
              // A row wrapper can wrap a full-width rail onto a second line.
              const inner = railed ? (
                body
              ) : (
                <Box alignItems="flex-start">
                  {props.selectedNodeId !== undefined ? (
                    <Box marginTop={1}>
                      <Text color={selected ? theme.accent : theme.mute}>
                        {selected ? `${glyphs.optionActive} ` : '  '}
                      </Text>
                    </Box>
                  ) : null}
                  <Box flexDirection="column" flexGrow={1} minWidth={0}>
                    {body}
                  </Box>
                </Box>
              )
              return clipNodeSlot({
                key: `${node.kind}:${node.id}`,
                skip,
                slot,
                children: inner,
              })
            })}
          </Box>
        )}
      </Box>
      {thumb === undefined ? null : (
        <Scrollbar
          height={props.maxRows ?? 1}
          start={thumb.start}
          size={thumb.size}
        />
      )}
    </Box>
  )
}
