import { Box, Text } from "ink";
import { theme } from "../theme.ts";

export function Help(props: { text: string }) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.mute}
      paddingX={1}
    >
      {props.text.split("\n").map((line, index) => (
        <Text key={`${index}:${line}`} color={theme.dim}>
          {line === "" ? " " : line}
        </Text>
      ))}
    </Box>
  );
}
