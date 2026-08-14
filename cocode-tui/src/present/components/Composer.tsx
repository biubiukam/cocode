import { Box, Text } from "ink";
import type { TuiSnapshot } from "../../runtime/app.ts";
import { theme } from "../theme.ts";

export function Composer(props: { composer: TuiSnapshot["composer"] }) {
  const { composer } = props;
  const empty = composer.text === "";
  return (
    <Box>
      <Text color={theme.brand}>{"> "}</Text>
      {empty ? (
        <Text color={theme.mute}>{composer.placeholder}</Text>
      ) : (
        <Text color={theme.text}>{composer.text}</Text>
      )}
    </Box>
  );
}
