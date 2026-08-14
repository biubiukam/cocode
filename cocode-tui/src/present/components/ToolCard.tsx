import { Box, Text } from "ink";
import type { ToolNode } from "../../runtime/nodes/types.ts";
import { theme } from "../theme.ts";

export function ToolCard(props: { node: ToolNode; verbose: boolean }) {
  const { node, verbose } = props;
  const mark =
    node.status === "running" ? "…" : node.status === "error" ? "x" : "ok";
  const color =
    node.status === "error"
      ? theme.error
      : node.status === "success"
        ? theme.success
        : theme.dim;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={color}>
        {mark} {node.name}
      </Text>
      {verbose && node.args !== "" ? (
        <Text color={theme.mute}>{node.args}</Text>
      ) : null}
      {verbose && node.result ? (
        <Text color={theme.tool}>{node.result}</Text>
      ) : null}
      {node.error ? <Text color={theme.error}>{node.error.code}</Text> : null}
    </Box>
  );
}
