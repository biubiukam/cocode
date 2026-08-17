import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../../src/runtime/nodes/types.ts";
import { BLOCK_GAP, MESSAGE_CHROME } from "../../src/present/layout.ts";
import { estimateNodeRows } from "../../src/present/visible-tail.ts";
import { glyphs } from "../../src/present/glyphs.ts";
import { formatToolSummaryLine } from "../../src/present/tool-display.ts";
import stringWidth from "string-width";
import {
  contentColumnFromMouseX,
  selectableNodeText,
  selectedMessageText,
  textPointAtViewportRow,
  textRangeForMessage,
  localTextRange,
  type MessageTextSelection,
} from "../../src/present/message-text-selection.ts";

const nodes: readonly ConversationNode[] = [
  { kind: "user", id: "one", seq: 1, time: 1, text: "hello world" },
  { kind: "user", id: "two", seq: 2, time: 2, text: "second message" },
];

describe("message text selection", () => {
  it("copies a partial range across message boundaries", () => {
    const selection: MessageTextSelection = {
      anchor: { nodeKey: "user:one", offset: 6 },
      focus: { nodeKey: "user:two", offset: 6 },
    };

    expect(selectedMessageText(nodes, selection)).toBe("world\n\nsecond");
    expect(textRangeForMessage(nodes, selection, "user:one")).toEqual({
      start: 6,
      end: 11,
    });
    expect(textRangeForMessage(nodes, selection, "user:two")).toEqual({
      start: 0,
      end: 6,
    });
  });

  it("copies the same text when the drag is reversed", () => {
    const forward: MessageTextSelection = {
      anchor: { nodeKey: "user:one", offset: 6 },
      focus: { nodeKey: "user:two", offset: 6 },
    };
    const backward: MessageTextSelection = {
      anchor: { nodeKey: "user:two", offset: 6 },
      focus: { nodeKey: "user:one", offset: 6 },
    };

    expect(selectedMessageText(nodes, backward)).toBe(
      selectedMessageText(nodes, forward),
    );
    expect(textRangeForMessage(nodes, backward, "user:one")).toEqual({
      start: 6,
      end: 11,
    });
  });

  it("copies nothing for a collapsed caret", () => {
    const selection: MessageTextSelection = {
      anchor: { nodeKey: "user:one", offset: 4 },
      focus: { nodeKey: "user:one", offset: 4 },
    };

    expect(selectedMessageText(nodes, selection)).toBe("");
    expect(textRangeForMessage(nodes, selection, "user:one")).toBeUndefined();
  });

  it("maps mouse cells onto the body row after message chrome", () => {
    const options = {
      nodes: [nodes[0]!],
      maxRows: 5,
      maxColumns: 20,
    };

    expect(
      textPointAtViewportRow({
        ...options,
        viewportRow: 0,
        cellColumn: 6,
      }),
    ).toEqual({ nodeKey: "user:one", offset: 0 });
    expect(
      textPointAtViewportRow({
        ...options,
        viewportRow: BLOCK_GAP,
        cellColumn: 6,
      }),
    ).toEqual({ nodeKey: "user:one", offset: 6 });
  });

  it("wraps body text with the same chrome columns as the row estimator", () => {
    const node: ConversationNode = {
      kind: "user",
      id: "wrap",
      seq: 1,
      time: 1,
      text: "abcdefghij",
    };
    const maxColumns = MESSAGE_CHROME + 5;

    expect(
      textPointAtViewportRow({
        nodes: [node],
        maxRows: 6,
        maxColumns,
        viewportRow: BLOCK_GAP,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: "user:wrap", offset: 0 });
    expect(
      textPointAtViewportRow({
        nodes: [node],
        maxRows: 6,
        maxColumns,
        viewportRow: BLOCK_GAP + 1,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: "user:wrap", offset: 5 });
  });

  it("continues an attached tool without a leading gap", () => {
    const assistant: ConversationNode = {
      kind: "assistant",
      id: "a1",
      seq: 1,
      time: 1,
      turn: 1,
      step: 0,
      text: "done",
      reasoning: "",
      streaming: false,
    };
    const tool: ConversationNode = {
      kind: "tool",
      id: "t1",
      seq: 2,
      time: 2,
      callId: "c1",
      name: "read",
      args: "",
      status: "success",
      result: "file body",
    };

    const assistantRows = estimateNodeRows(assistant, false, false, 40);
    const summary = formatToolSummaryLine(tool, "en", 40);

    expect(
      textPointAtViewportRow({
        nodes: [assistant, tool],
        maxRows: 10,
        maxColumns: 40,
        viewportRow: assistantRows,
        cellColumn: stringWidth(summary.slice(0, summary.indexOf("file"))),
      }),
    ).toEqual({ nodeKey: "tool:t1", offset: summary.indexOf("file") });
  });

  it("converts 1-based mouse columns through message chrome", () => {
    expect(contentColumnFromMouseX(1 + MESSAGE_CHROME)).toBe(0);
    expect(contentColumnFromMouseX(1 + MESSAGE_CHROME + 6)).toBe(6);
  });

  it("selects visible thinking text before the assistant reply", () => {
    const assistant: ConversationNode = {
      kind: "assistant",
      id: "a1",
      seq: 1,
      time: 1,
      turn: 1,
      step: 0,
      text: "answer",
      reasoning: "thoughts",
      streaming: false,
    };
    const selection: MessageTextSelection = {
      anchor: { nodeKey: "assistant:a1", offset: 0 },
      focus: { nodeKey: "assistant:a1", offset: 8 },
    };

    expect(selectableNodeText(assistant)).toBe("thoughts\nanswer");
    expect(selectableNodeText({ ...assistant, thinkingDurationMs: 1250 })).toBe(
      "thoughts\nanswer",
    );
    expect(selectedMessageText([assistant], selection)).toBe("thoughts");
    expect(textRangeForMessage([assistant], selection, "assistant:a1")).toEqual(
      {
        start: 0,
        end: 8,
      },
    );
    expect(
      textPointAtViewportRow({
        nodes: [assistant],
        maxRows: 8,
        maxColumns: 40,
        viewportRow: BLOCK_GAP,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: "assistant:a1", offset: 0 });
    expect(
      textPointAtViewportRow({
        nodes: [assistant],
        maxRows: 8,
        maxColumns: 40,
        viewportRow: BLOCK_GAP + 1,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: "assistant:a1", offset: 8 });
    expect(
      textPointAtViewportRow({
        nodes: [assistant],
        maxRows: 8,
        maxColumns: 40,
        viewportRow: BLOCK_GAP + 2,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: "assistant:a1", offset: 9 });
    expect(localTextRange({ start: 0, end: 8 }, 0, 8)).toEqual({
      start: 0,
      end: 8,
    });
    expect(localTextRange({ start: 0, end: 8 }, 9, 6)).toBeUndefined();
    expect(localTextRange({ start: 9, end: 15 }, 9, 6)).toEqual({
      start: 0,
      end: 6,
    });
  });

  it("maps a markdown list row to the item text, not the preceding paragraph", () => {
    const text = [
      "Here are some things I can assist with:",
      "",
      "- 🔍 Explore the codebase",
      "- 📝 Review code or changes",
    ].join("\n");
    const assistant: ConversationNode = {
      kind: "assistant",
      id: "list",
      seq: 1,
      time: 1,
      turn: 1,
      step: 0,
      text,
      reasoning: "",
      streaming: false,
    };
    const changes = text.indexOf("changes");
    const item = "📝 Review code or changes";
    const cellColumn =
      stringWidth(`${glyphs.listBullet} `) +
      stringWidth(item.slice(0, item.indexOf("changes")));

    expect(
      textPointAtViewportRow({
        nodes: [assistant],
        maxRows: 12,
        maxColumns: 80,
        viewportRow: BLOCK_GAP + 2,
        cellColumn,
      }),
    ).toEqual({ nodeKey: "assistant:list", offset: changes });
  });
});
