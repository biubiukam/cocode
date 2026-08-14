import { Text } from "ink";
import type { NoticeNode } from "../../runtime/nodes/types.ts";
import { theme } from "../theme.ts";

export function NoticeRow(props: { node: NoticeNode }) {
  const color = props.node.tone === "error" ? theme.error : theme.info;
  return <Text color={color}>{props.node.message}</Text>;
}
