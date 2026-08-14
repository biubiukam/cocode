/**
 * Cocode TUI entry: TTY check, env, start app, render Ink.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "ink";
import { parseInitFromEnv, parseLaunchFromEnv } from "@cocode/tui-connection";
import { createTuiApp } from "./runtime/app.ts";
import { Chat } from "./present/chat.tsx";

loadDotenv(resolve(process.cwd(), ".env"));

if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
  process.stderr.write("Cocode TUI requires a TTY.\n");
  process.exitCode = 1;
} else {
  void main();
}

async function main(): Promise<void> {
  const launch = parseLaunchFromEnv();
  if ("error" in launch) {
    process.stderr.write(`${launch.error}\n`);
    process.exitCode = 1;
    return;
  }
  const init = parseInitFromEnv();
  const { createTuiRuntime } = await import("@cocode/tui-connection");
  const runtime = createTuiRuntime(launch);
  const app = createTuiApp({
    runtime,
    cwd: init.cwd,
    provider: init.provider,
    model: init.model,
  });

  const screen = render(<Chat app={app} />);
  await app.start();

  await new Promise<void>((resolveExit) => {
    const stop = app.subscribe(() => {
      if (!app.snapshot().exiting) return;
      stop();
      void screen.unmount();
      resolveExit();
    });
  });
}

function loadDotenv(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
