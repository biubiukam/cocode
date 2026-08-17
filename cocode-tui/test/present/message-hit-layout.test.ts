import { Writable } from "node:stream";
import React from "react";
import { Box, render } from "ink";
import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../../src/runtime/nodes/types.ts";
import { MessageList } from "../../src/present/components/MessageList.tsx";
import {
  estimateNodeRows,
  nodeAttached,
} from "../../src/present/visible-tail.ts";
import { BLOCK_GAP, MESSAGE_CHROME } from "../../src/present/layout.ts";
import {
  resolveMessageWindow,
  transcriptPaintColumns,
} from "../../src/present/message-scroll.ts";
import { formatToolSummaryLine } from "../../src/present/tool-display.ts";
import { textPointAtViewportRow } from "../../src/present/message-text-selection.ts";
import { wrapPlainText } from "../../src/present/text-wrap.ts";

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const FRAME_BOUNDARY = "\u001b[?25l";

describe("message hit layout", () => {
  it("counts the same rows Ink draws for stacked user messages", async () => {
    const nodes: ConversationNode[] = [
      { kind: "user", id: "one", seq: 1, time: 1, text: "hello" },
      { kind: "user", id: "two", seq: 2, time: 2, text: "world" },
    ];
    const maxColumns = 40;
    const estimated = nodes.reduce(
      (total, node) => total + estimateNodeRows(node, false, false, maxColumns),
      0,
    );
    const lines = await renderLines(nodes, maxColumns);
    expect(estimateNodeRows(nodes[0]!, false, false, maxColumns)).toBe(
      BLOCK_GAP + 1,
    );
    expect(lines).toEqual(["", "│ hello", "", "│ world"]);
    expect(estimated).toBe(lines.length);
  });

  it("maps a click on the second body row to that character, not the previous message", async () => {
    const nodes: ConversationNode[] = [
      { kind: "user", id: "one", seq: 1, time: 1, text: "hello" },
      { kind: "user", id: "two", seq: 2, time: 2, text: "world" },
    ];
    const maxColumns = 40;
    const lines = await renderLines(nodes, maxColumns);
    const secondBody = lines.findIndex((line) => line.includes("world"));

    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 20,
        maxColumns,
        viewportRow: secondBody,
        cellColumn: 2,
      }),
    ).toEqual({ nodeKey: "user:two", offset: 2 });
  });

  it("uses Ink wrap-ansi line breaks for wrapped user text", () => {
    const text = "hello world friends";
    const columns = 10;
    const lines = wrapPlainText(text, columns);

    expect(lines.map((line) => text.slice(line.start, line.end))).toEqual([
      "hello ",
      "world ",
      "friends",
    ]);
    expect(
      textPointAtViewportRow({
        nodes: [{ kind: "user", id: "wrap", seq: 1, time: 1, text }],
        maxRows: 10,
        maxColumns: columns + MESSAGE_CHROME,
        viewportRow: BLOCK_GAP + 2,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: "user:wrap", offset: 12 });
  });

  it("maps a click on a rendered markdown list item to that source offset", async () => {
    const text = [
      "Here are some things I can assist with:",
      "",
      "- 🔍 Explore the codebase",
      "- 📝 Review code or changes",
    ].join("\n");
    const nodes: ConversationNode[] = [
      {
        kind: "assistant",
        id: "list",
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text,
        reasoning: "",
        streaming: false,
      },
    ];
    const maxColumns = 80;
    const lines = await renderLines(nodes, maxColumns);
    const row = lines.findIndex((line) => line.includes("changes"));
    const line = lines[row] ?? "";
    const cellColumn = Math.max(
      0,
      stringWidth(line.slice(0, Math.max(0, line.indexOf("changes")))) -
        MESSAGE_CHROME,
    );

    expect(row).toBeGreaterThan(0);
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 20,
        maxColumns,
        viewportRow: row,
        cellColumn,
      }),
    ).toEqual({ nodeKey: "assistant:list", offset: text.indexOf("changes") });
  });

  it("maps a click after an attached tool onto that thinking line, not the one above", async () => {
    const reasoning = [
      "can be more helpful. Let me see what is in the working directory.",
      "▪ I need to actually run a command to explore the project.",
    ].join("\n");
    const nodes: ConversationNode[] = [
      {
        kind: "assistant",
        id: "a1",
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text: "done",
        reasoning: "",
        streaming: false,
      },
      {
        kind: "tool",
        id: "t1",
        seq: 2,
        time: 2,
        callId: "c1",
        name: "browser_snapshot",
        args: "",
        status: "error",
        error: { name: "ToolArgsError", code: "INVALID_ARGS" },
      },
      {
        kind: "assistant",
        id: "a2",
        seq: 3,
        time: 3,
        turn: 1,
        step: 1,
        text: "",
        reasoning,
        streaming: false,
      },
    ];
    const maxColumns = 80;
    const lines = await renderLines(nodes, maxColumns);
    const row = lines.findIndex((line) => line.includes("I need to actually"));

    expect(row).toBeGreaterThan(0);
    expect(lines[row - 1]).toContain("can be more helpful");
    expect(estimateNodeRows(nodes[1]!, false, false, maxColumns, true)).toBe(1);
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 30,
        maxColumns,
        viewportRow: row,
        cellColumn: 0,
      }),
    ).toEqual({
      nodeKey: "assistant:a2",
      offset: reasoning.indexOf("▪"),
    });
  });

  it("maps the tool line and the thinking after it when the transcript overflows", async () => {
    const afterTool =
      "I need to actually run a command to explore the project.";
    const nodes: ConversationNode[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        kind: "user" as const,
        id: `pad-${index}`,
        seq: index + 1,
        time: index + 1,
        text: `hello-${index}`,
      })),
      {
        kind: "assistant",
        id: "a1",
        seq: 10,
        time: 10,
        turn: 1,
        step: 0,
        text: "",
        reasoning: "check the current working directory",
        streaming: false,
      },
      {
        kind: "tool",
        id: "t1",
        seq: 11,
        time: 11,
        callId: "c1",
        name: "browser_snapshot",
        args: "",
        status: "error",
        error: { name: "ToolArgsError", code: "INVALID_ARGS" },
      },
      {
        kind: "assistant",
        id: "a2",
        seq: 12,
        time: 12,
        turn: 1,
        step: 1,
        text: "",
        reasoning: afterTool,
        streaming: false,
      },
    ];
    const maxColumns = 80;
    const maxRows = 10;
    const paintColumns = transcriptPaintColumns(
      nodes,
      maxRows,
      false,
      undefined,
      maxColumns,
    );
    const lines = await renderLines(nodes, maxColumns, maxRows);
    const toolRow = lines.findIndex((line) =>
      line.includes("browser_snapshot"),
    );
    const thinkingRow = lines.findIndex((line) =>
      line.includes("I need to actually"),
    );

    expect(paintColumns).toBe(maxColumns - 1);
    expect(toolRow).toBeGreaterThan(0);
    expect(thinkingRow).toBeGreaterThan(toolRow);
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: toolRow,
        cellColumn: 0,
      })?.nodeKey,
    ).toBe("tool:t1");
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: thinkingRow,
        cellColumn: 0,
      }),
    ).toEqual({
      nodeKey: "assistant:a2",
      offset: 0,
    });
    const toolLine = lines[toolRow] ?? "";
    const detail = "INVALID_ARGS";
    const cellColumn = Math.max(
      0,
      stringWidth(toolLine.slice(0, Math.max(0, toolLine.indexOf(detail)))) -
        MESSAGE_CHROME,
    );
    const summary = formatToolSummaryLine(
      nodes[7] as Extract<ConversationNode, { kind: "tool" }>,
      "en",
      paintColumns ?? maxColumns,
    );
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: toolRow,
        cellColumn,
      }),
    ).toEqual({
      nodeKey: "tool:t1",
      offset: summary.indexOf(detail),
    });
  });

  it("paints the same number of thinking rows that hit-testing estimates", async () => {
    const reasoning = [
      "The user keeps saying hello repeatedly so I should just respond warmly and maybe offer to do something concrete instead of asking again.",
      "Actually, rather than asking again, let me just do something useful — check the current working directory.",
    ].join("\n");
    const node: ConversationNode = {
      kind: "assistant",
      id: "a1",
      seq: 1,
      time: 1,
      turn: 1,
      step: 0,
      text: "",
      reasoning,
      streaming: false,
    };
    const maxColumns = 80;
    const columns = maxColumns - MESSAGE_CHROME;
    const lines = await renderLines([node], maxColumns);
    const painted = [
      ...new Set(
        lines.filter(
          (line) =>
            line.includes("The user") ||
            line.includes("maybe offer") ||
            line.includes("Actually") ||
            line.includes("directory"),
        ),
      ),
    ];
    expect(estimateNodeRows(node, false, false, maxColumns)).toBe(
      BLOCK_GAP + wrapPlainText(reasoning, columns).length,
    );
    expect(painted.length).toBe(wrapPlainText(reasoning, columns).length);
  });

  it("keeps the tool row aligned after long wrapped thinking", async () => {
    const reasoning = [
      "The user keeps saying hello repeatedly so I should just respond warmly and maybe offer to do something concrete instead of asking again.",
      "Actually, rather than asking again, let me just do something useful — check the current working directory.",
    ].join("\n");
    const nodes: ConversationNode[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        kind: "user" as const,
        id: `pad-${index}`,
        seq: index + 1,
        time: index + 1,
        text: `hello-${index} with enough text to keep earlier rows in the scrollback`,
      })),
      {
        kind: "assistant",
        id: "a1",
        seq: 20,
        time: 20,
        turn: 1,
        step: 0,
        text: "",
        reasoning,
        streaming: false,
      },
      {
        kind: "tool",
        id: "t1",
        seq: 21,
        time: 21,
        callId: "c1",
        name: "browser_snapshot",
        args: "",
        status: "error",
        error: { name: "ToolArgsError", code: "INVALID_ARGS" },
      },
    ];
    const maxColumns = 80;
    const maxRows = 12;
    const paintColumns = transcriptPaintColumns(
      nodes,
      maxRows,
      false,
      undefined,
      maxColumns,
    );
    const lines = await renderLines(nodes, maxColumns, maxRows);
    const toolRow = lines.findIndex((line) =>
      line.includes("browser_snapshot"),
    );

    expect(toolRow).toBeGreaterThan(0);
    expect(estimatedViewportRow(nodes, maxRows, paintColumns, "t1")).toBe(
      toolRow,
    );
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: toolRow,
        cellColumn: 0,
      })?.nodeKey,
    ).toBe("tool:t1");
  });
});

function estimatedViewportRow(
  nodes: readonly ConversationNode[],
  maxRows: number,
  maxColumns: number | undefined,
  toolId: string,
): number {
  const window = resolveMessageWindow(
    nodes,
    maxRows,
    false,
    undefined,
    0,
    maxColumns,
  );
  let row = -window.hiddenRowsBefore;
  const startIndex =
    window.nodes[0] === undefined ? 0 : nodes.indexOf(window.nodes[0]);
  for (let offset = 0; offset < window.nodes.length; offset += 1) {
    const node = window.nodes[offset];
    if (node === undefined) continue;
    if (node.kind === "tool" && node.id === toolId) return row;
    row += estimateNodeRows(
      node,
      false,
      false,
      maxColumns,
      nodeAttached(nodes, startIndex + offset),
    );
  }
  return -1;
}

async function renderLines(
  nodes: readonly ConversationNode[],
  maxColumns: number,
  maxRows?: number,
): Promise<string[]> {
  const stdout = new CaptureStream(maxColumns, maxRows ?? 30);
  const app = render(
    React.createElement(
      Box,
      { width: maxColumns, height: maxRows },
      React.createElement(MessageList, {
        nodes,
        verbose: false,
        locale: "en",
        maxColumns,
        maxRows,
      }),
    ),
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  app.unmount();
  await new Promise<void>((resolve) => setImmediate(resolve));
  app.cleanup();
  const frame = latestFrame(stdout.output);
  const lines = frame.split("\n");
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

function latestFrame(output: string): string {
  const frames = output.split(FRAME_BOUNDARY);
  const plain = (frames.at(-1) ?? output)
    .replace(ANSI_PATTERN, "")
    .replaceAll("\r", "");
  const lines = plain.split("\n");
  for (let index = lines.length - 1; index >= 2; index -= 1) {
    if (
      lines[index]?.includes("│ world") === true &&
      lines[index - 2]?.includes("│ hello") === true &&
      lines[index - 1] === "" &&
      lines[index - 3] === ""
    ) {
      return lines.slice(index - 3, index + 1).join("\n");
    }
  }
  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n");
}

class CaptureStream extends Writable {
  readonly isTTY = true;
  output = "";

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    super();
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString();
    callback();
  }
}
