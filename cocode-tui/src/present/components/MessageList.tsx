import { Box } from "ink";
import type { ConversationNode } from "../../runtime/nodes/types.ts";
import { renderNode } from "../nodes.tsx";

export function MessageList(props: {
  nodes: readonly ConversationNode[];
  verbose: boolean;
}) {
  return (
    <Box flexDirection="column">
      {props.nodes.map((node) => (
        <Box key={`${node.kind}:${node.id}`}>
          {renderNode(node, props.verbose)}
        </Box>
      ))}
    </Box>
  );
}
