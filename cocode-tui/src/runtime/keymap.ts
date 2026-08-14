/**
 * Keystroke → command id. Present translates; this table does not run side
 * effects.
 */

export type CommandId =
  | "input.submit"
  | "input.newline"
  | "session.interruptOrQuit"
  | "app.quit"
  | "transcript.toggleVerbose"
  | "help.toggle"
  | "history.prev"
  | "history.next";

export type KeyMatch = {
  id: CommandId;
  /** When true, only fire if the composer is empty. */
  emptyOnly?: boolean;
};

export function matchKey(input: {
  raw: string;
  return?: boolean;
  escape?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  empty: boolean;
}): KeyMatch | undefined {
  if (input.return && (input.shift || (input.ctrl && input.raw === "j"))) {
    return { id: "input.newline" };
  }
  if (input.return) return { id: "input.submit" };
  if (input.ctrl && input.raw === "c") return { id: "session.interruptOrQuit" };
  if (input.ctrl && input.raw === "d")
    return { id: "app.quit", emptyOnly: true };
  if (input.escape) return { id: "session.interruptOrQuit" };
  if (input.ctrl && input.raw === "o")
    return { id: "transcript.toggleVerbose" };
  if (input.raw === "?" && input.empty) return { id: "help.toggle" };
  if (input.upArrow) return { id: "history.prev" };
  if (input.downArrow) return { id: "history.next" };
  return undefined;
}
