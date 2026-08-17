import { Box, Text, type TextProps } from "ink";
import type { ReactNode } from "react";
import { graphemeSegments } from "../../runtime/grapheme.ts";
import { selectionStyle } from "../selection.ts";
import {
  localTextRange,
  type MessageTextRange,
} from "../message-text-selection.ts";
import { wrapPlainText } from "../text-wrap.ts";

/** Render text with a character-level selection fill while preserving wrapping. */
export function SelectableText(
  props: TextProps & {
    text: string;
    selection?: MessageTextRange;
  },
) {
  const { text, selection, ...textProps } = props;
  if (selection === undefined || selection.start >= selection.end) {
    return <Text {...textProps}>{text}</Text>;
  }
  const children: ReactNode[] = [];
  let cursor = 0;
  let selected = false;
  let buffer = "";
  const flush = (): void => {
    if (buffer === "") return;
    children.push(
      selected ? (
        <Text key={`${cursor}:selected`} {...selectionStyle(true)}>
          {buffer}
        </Text>
      ) : (
        <Text key={`${cursor}:plain`}>{buffer}</Text>
      ),
    );
    buffer = "";
  };
  for (const entry of graphemeSegments(text)) {
    const nextSelected =
      entry.index >= selection.start && entry.index < selection.end;
    if (nextSelected !== selected) {
      flush();
      selected = nextSelected;
    }
    buffer += entry.segment;
    cursor = entry.index + entry.segment.length;
  }
  flush();
  return <Text {...textProps}>{children}</Text>;
}

/** Paint the same wrapPlainText rows that hit-testing walks. */
export function WrappedSelectableText(
  props: TextProps & {
    text: string;
    columns: number;
    selection?: MessageTextRange;
  },
) {
  const { text, columns, selection, ...textProps } = props;
  const width = Math.max(1, Math.trunc(columns));
  return (
    <Box flexDirection="column" width={width} minWidth={0}>
      {wrapPlainText(text, width).map((line, index) => {
        const slice = text.slice(line.start, line.end);
        if (slice === "") {
          return (
            <Text key={`${line.start}:${index}`} {...textProps}>
              {" "}
            </Text>
          );
        }
        return (
          <SelectableText
            key={`${line.start}:${index}`}
            {...textProps}
            wrap="truncate-end"
            text={slice}
            selection={localTextRange(selection, line.start, slice.length)}
          />
        );
      })}
    </Box>
  );
}
