import { describe, expect, it } from "vitest";
import type { TuiAction } from "../../src/runtime/app.ts";
import {
  createBuiltinCommands,
  parseSlash,
} from "../../src/runtime/commands.ts";
import { P0_CAPABILITIES } from "../../src/runtime/capabilities.ts";

describe("commands", () => {
  it("parses slash name and args", () => {
    expect(parseSlash("/status")).toEqual({ name: "status", args: "" });
    expect(parseSlash("/theme dark")).toEqual({ name: "theme", args: "dark" });
    expect(parseSlash("hello")).toBeNull();
  });

  it("lists only available local commands", () => {
    const names = createBuiltinCommands()
      .list(P0_CAPABILITIES)
      .map((command) => command.name);
    expect(names).toEqual([
      "help",
      "exit",
      "clear",
      "status",
      "doctor",
      "theme",
      "export",
      "init",
      "new",
      "login",
      "logout",
    ]);
  });

  it("unknown names are absent", () => {
    expect(
      createBuiltinCommands().find("resume", P0_CAPABILITIES),
    ).toBeUndefined();
  });

  it("/exit dispatches quit", () => {
    const actions: TuiAction[] = [];
    const command = createBuiltinCommands().find("exit", P0_CAPABILITIES);
    command?.run(
      {
        dispatch: (action) => actions.push(action),
        newSession: () => {},
        clearTranscript: () => {},
        showStatus: () => {},
        notice: () => {},
        logout: async () => {},
      },
      "",
    );
    expect(actions).toEqual([{ type: "quit" }]);
  });

  it("/login asks the user to restart", () => {
    const notices: string[] = [];
    const command = createBuiltinCommands().find("login", P0_CAPABILITIES);
    command?.run(
      {
        dispatch: () => {},
        newSession: () => {},
        clearTranscript: () => {},
        showStatus: () => {},
        notice: (_tone, message) => notices.push(message),
        logout: async () => {},
      },
      "",
    );
    expect(notices.join("\n")).toMatch(/logout/);
    expect(notices.join("\n")).not.toMatch(/sk-|ck_/);
  });
});
