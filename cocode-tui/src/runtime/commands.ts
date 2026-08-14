/**
 * Local slash table. Missing wire capabilities stay off the menu.
 */

import type { TuiCapabilities } from "./capabilities.ts";
import type { TuiAction, TuiCommandCtx } from "./app.ts";

export type Command = {
  name: string;
  summary: string;
  kind: "local" | "prompt-text";
  available: (caps: TuiCapabilities) => boolean;
  run: (app: TuiCommandCtx, args: string) => void;
};

export class CommandRegistry {
  private readonly commands: Command[] = [];

  register(command: Command): void {
    this.commands.push(command);
  }

  list(caps: TuiCapabilities): Command[] {
    return this.commands.filter((command) => command.available(caps));
  }

  find(name: string, caps: TuiCapabilities): Command | undefined {
    const needle = name.replace(/^\//, "").toLowerCase();
    return this.list(caps).find((command) => command.name === needle);
  }
}

export function createBuiltinCommands(): CommandRegistry {
  const registry = new CommandRegistry();
  const local = (name: string, summary: string, run: Command["run"]): void => {
    registry.register({
      name,
      summary,
      kind: "local",
      available: () => true,
      run,
    });
  };

  local("help", "Show keyboard and command help", (ctx) => {
    ctx.dispatch({ type: "toggleHelp" });
  });
  local("exit", "Shut down the runtime and leave", (ctx) => {
    ctx.dispatch({ type: "quit" });
  });
  local("clear", "Clear the projected transcript", (ctx) => {
    ctx.clearTranscript();
  });
  local("status", "Show session, model, and agent state", (ctx) => {
    ctx.showStatus();
  });
  local("theme", "P0 ships one dark theme", (ctx) => {
    ctx.notice("info", "P0 theme is dark only. /theme light arrives in P1.");
  });
  local("new", "Start a new session id (not a fork)", (ctx) => {
    ctx.newSession();
  });

  return registry;
}

export function parseSlash(
  line: string,
): { name: string; args: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return null;
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (match === null) return null;
  return { name: match[1] ?? "", args: (match[2] ?? "").trim() };
}

export function helpText(
  caps: TuiCapabilities,
  registry: CommandRegistry,
): string {
  const commands = registry
    .list(caps)
    .map((command) => `/${command.name}  ${command.summary}`)
    .join("\n");
  return [
    "Cocode TUI",
    "enter send · esc/ctrl+c interrupt-or-quit · ? help",
    "ctrl+o verbose · up/down history",
    "",
    "Local commands (not the GUI command registry):",
    commands,
  ].join("\n");
}
