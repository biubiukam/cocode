import { Box, Text } from "ink";
import type { TuiSnapshot } from "../../runtime/app.ts";
import { theme } from "../theme.ts";

export function StatusLine(props: {
  status: TuiSnapshot["status"];
  notice?: TuiSnapshot["notice"];
}) {
  const notice = props.notice;
  return (
    <Box flexDirection="column">
      <Text color={theme.mute}>{props.status.line}</Text>
      {notice ? (
        <Text color={notice.tone === "error" ? theme.error : theme.info}>
          {notice.message}
        </Text>
      ) : null}
    </Box>
  );
}
