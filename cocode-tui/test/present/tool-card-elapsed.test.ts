import { Writable } from "node:stream";
import React from "react";
import { Box, render } from "ink";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolCard } from "../../src/present/components/ToolCard.tsx";
import { SPINNER_PERIOD_MS } from "../../src/present/use-spinner.ts";

describe("running tool elapsed clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances elapsed time while a tool stays running without new events", async () => {
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    vi.setSystemTime(new Date("2026-08-17T10:00:10.000Z"));
    const stdout = new CaptureStream(80, 8);
    const app = render(
      React.createElement(
        Box,
        { width: 80 },
        React.createElement(ToolCard, {
          node: {
            kind: "tool",
            id: "elapsed-1",
            seq: 1,
            time: Date.now() - 1_000,
            callId: "elapsed-1",
            name: "ask_user_question",
            args: '{"questions":[{"id":"next","question":"What next?"}]}',
            status: "running",
          },
          verbose: false,
          locale: "en",
          maxColumns: 80,
        }),
      ),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(visible(stdout.output)).toContain("1s");

    stdout.output = "";
    vi.setSystemTime(new Date("2026-08-17T10:00:12.000Z"));
    await vi.advanceTimersByTimeAsync(SPINNER_PERIOD_MS);
    expect(visible(stdout.output)).toContain("3s");

    app.unmount();
    await vi.advanceTimersByTimeAsync(0);
    app.cleanup();
  });
});

function visible(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
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
