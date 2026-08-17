import { Box, Text } from "ink";
import type { ConversationNode } from "../../runtime/nodes/types.ts";
import { nodeKey } from "../../runtime/nodes/types.ts";
import {
  maxMessageScrollOffset,
  resolveMessageWindow,
  transcriptPaintColumns,
} from "../message-scroll.ts";
import { glyphs } from "../glyphs.ts";
import { renderNode } from "../nodes.tsx";
import { scrollbarThumb } from "../scrollbar.ts";
import { nodeAttached } from "../visible-tail.ts";
import { theme } from "../theme.ts";
import { EmptyState } from "./EmptyState.tsx";
import { Scrollbar } from "./Scrollbar.tsx";
import type { UiLocale } from "../../runtime/ui-locale.ts";
import type { MessageTextSelection } from "../message-text-selection.ts";
import { textRangeForMessage } from "../message-text-selection.ts";

/** Kinds drawn inside a MessageRail, which handles their own indent and selection. */
function hasRail(kind: string | undefined): boolean {
  return kind === "user" || kind === "assistant" || kind === "tool";
}

export function MessageList(props: {
  nodes: readonly ConversationNode[];
  verbose: boolean;
  maxRows?: number;
  scrollOffset?: number;
  selectedNodeId?: string | null;
  textSelection?: MessageTextSelection;
  expandedNodeIds?: ReadonlySet<string>;
  expandedNodeLevels?: ReadonlyMap<string, 0 | 1 | 2>;
  locale: UiLocale;
  maxColumns?: number;
}) {
  const visibleNodes = props.nodes.filter((node) => {
    const expanded =
      props.expandedNodeIds?.has(nodeKey(node.kind, node.id)) === true;
    if (node.kind === "context") return props.verbose || expanded;
    if (node.kind === "notice" && node.verboseOnly === true)
      return props.verbose;
    return true;
  });
  const selectedNode = visibleNodes.find(
    (node) => props.selectedNodeId === nodeKey(node.kind, node.id),
  );
  const paintColumns =
    props.maxRows === undefined
      ? props.maxColumns
      : transcriptPaintColumns(
          visibleNodes,
          props.maxRows,
          props.verbose,
          props.expandedNodeIds,
          props.maxColumns,
        );
  const contentColumns =
    paintColumns === undefined
      ? undefined
      : Math.max(
          1,
          paintColumns -
            (selectedNode !== undefined && !hasRail(selectedNode.kind) ? 2 : 0),
        );
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
        );
  const nodes = window.nodes;
  const windowStartIndex =
    nodes[0] === undefined ? 0 : visibleNodes.indexOf(nodes[0]);
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
        });
  return (
    <Box
      flexDirection="row"
      width="100%"
      flexGrow={1}
      minHeight={0}
      height={props.maxRows}
      overflowY={props.maxRows === undefined ? "visible" : "hidden"}
    >
      <Box
        flexDirection="column"
        flexGrow={1}
        minWidth={0}
        height={props.maxRows}
        overflowY={props.maxRows === undefined ? "visible" : "hidden"}
      >
        {nodes.length === 0 ? (
          <EmptyState
            maxRows={props.maxRows}
            maxColumns={props.maxColumns}
            locale={props.locale}
          />
        ) : (
          <Box
            flexDirection="column"
            width="100%"
            marginTop={-window.hiddenRowsBefore}
          >
            {nodes.map((node, index) => {
              const key = nodeKey(node.kind, node.id);
              const selected = props.selectedNodeId === key;
              const expanded = props.expandedNodeIds?.has(key) === true;
              const railed = hasRail(node.kind);
              // A tool follows the reply that called it, so the two share one rail.
              const attached = nodeAttached(
                visibleNodes,
                windowStartIndex + index,
              );
              return (
                <Box key={`${node.kind}:${node.id}`} alignItems="flex-start">
                  {/* Railed rows show selection through the rail itself; the rest
                      need a marker column. */}
                  {props.selectedNodeId !== undefined && !railed ? (
                    <Box marginTop={1}>
                      <Text color={selected ? theme.accent : theme.mute}>
                        {selected ? `${glyphs.optionActive} ` : "  "}
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
                      maxColumns: railed ? paintColumns : contentColumns,
                      textSelection: textRangeForMessage(
                        props.nodes,
                        props.textSelection,
                        key,
                        {
                          verbose: props.verbose,
                          expandedNodeIds: props.expandedNodeIds,
                          locale: props.locale,
                          maxColumns: railed ? paintColumns : contentColumns,
                        },
                      ),
                    })}
                  </Box>
                </Box>
              );
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
  );
}
