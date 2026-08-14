import { Box, Text } from "ink";
import type { AssistantNode } from "../../runtime/nodes/types.ts";
import { theme } from "../theme.ts";

export function AssistantRow(props: { node: AssistantNode; verbose: boolean }) {
  const { node, verbose } = props;
  const showReasoning = verbose && node.reasoning !== "";
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.brand}>{node.streaming ? "cocode …" : "cocode"}</Text>
      {showReasoning ? (
        <Text color={theme.mute} italic>
          {node.reasoning}
        </Text>
      ) : null}
      {node.text !== "" ? (
        <Text color={theme.assistant}>{node.text}</Text>
      ) : null}
    </Box>
  );
}
