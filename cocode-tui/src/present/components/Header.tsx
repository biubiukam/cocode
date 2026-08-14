import { Box, Text } from "ink";
import type { TuiSnapshot } from "../../runtime/app.ts";
import { theme } from "../theme.ts";

export function Header(props: { header: TuiSnapshot["header"] }) {
  const { header } = props;
  const session = header.sessionId.slice(0, 8);
  return (
    <Box gap={1}>
      <Text color={theme.brand} bold>
        Cocode
      </Text>
      <Text color={theme.mute}>{session}</Text>
      <Text color={theme.dim}>
        {header.provider}/{header.model}
      </Text>
    </Box>
  );
}
