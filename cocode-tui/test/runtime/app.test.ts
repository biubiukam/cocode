import { describe, expect, it } from "vitest";
import type { TuiNotification, TuiRuntime } from "@cocode/tui-connection";
import { createTuiApp } from "../../src/runtime/app.ts";

function fakeRuntime(): TuiRuntime & {
  prompts: { sessionId: string; text: string }[];
  emit: (n: TuiNotification) => void;
  emitClose: (error?: string) => void;
  closeCount: number;
  failStart?: Error;
} {
  const handlers = new Set<(n: TuiNotification) => void>();
  const closeHandlers = new Set<(error?: string) => void>();
  const runtime: TuiRuntime & {
    prompts: { sessionId: string; text: string }[];
    emit: (n: TuiNotification) => void;
    failStart?: Error;
  } = {
    prompts: [],
    closeCount: 0,
    emit(n) {
      for (const handler of handlers) handler(n);
    },
    emitClose(error) {
      for (const handler of closeHandlers) handler(error);
    },
    async start() {
      if (runtime.failStart) throw runtime.failStart;
      return { name: "fake-runtime", version: "0" };
    },
    async prompt(sessionId, blocks) {
      const text = typeof blocks[0]?.text === "string" ? blocks[0].text : "";
      runtime.prompts.push({ sessionId, text });
      return "mid-1";
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    async close() {
      runtime.closeCount += 1;
    },
  };
  return runtime;
}

describe("TuiApp", () => {
  it("prompts only when idle", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "deepseek-official",
      model: "deepseek-v4-flash",
      sessionId: "s1",
    });
    await app.start();
    app.dispatch({ type: "submit", text: "hello" });
    expect(runtime.prompts).toEqual([{ sessionId: "s1", text: "hello" }]);
    runtime.emit({
      method: "session.status",
      params: { sessionId: "s1", status: "running" },
    });
    app.dispatch({ type: "submit", text: "again" });
    expect(runtime.prompts).toHaveLength(1);
    expect(app.snapshot().notice?.message).toMatch(/Turn in progress/);
  });

  it("ingests session.event into nodes", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      sessionId: "s1",
    });
    await app.start();
    runtime.emit({
      method: "session.event",
      params: {
        sessionId: "s1",
        event: {
          type: "user/message",
          seq: 1,
          time: 1,
          data: {
            id: "u1",
            role: "user",
            content: [{ type: "text", text: "hi" }],
            source: { kind: "user" },
          },
        },
      },
    });
    expect(app.snapshot().nodes[0]).toMatchObject({ kind: "user", text: "hi" });
  });

  it("ignores events for other sessions", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      sessionId: "s1",
    });
    await app.start();
    runtime.emit({
      method: "session.event",
      params: {
        sessionId: "other",
        event: {
          type: "user/message",
          seq: 1,
          time: 1,
          data: {
            id: "u1",
            content: [{ type: "text", text: "nope" }],
          },
        },
      },
    });
    expect(app.snapshot().nodes).toEqual([]);
  });

  it("arms interrupt then quits on the second press", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      sessionId: "s1",
    });
    await app.start();
    runtime.emit({
      method: "session.status",
      params: { sessionId: "s1", status: "running" },
    });
    app.dispatch({ type: "interruptOrQuit" });
    expect(app.snapshot().exiting).toBe(false);
    expect(app.snapshot().notice?.message).toMatch(/cannot cancel/);
    app.dispatch({ type: "interruptOrQuit" });
    expect(app.snapshot().exiting).toBe(true);
  });

  it("requires two idle interrupts to quit", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      sessionId: "s1",
    });
    await app.start();
    app.dispatch({ type: "interruptOrQuit" });
    expect(app.snapshot().exiting).toBe(false);
    expect(app.snapshot().notice?.message).toMatch(/Press again/);
    app.dispatch({ type: "interruptOrQuit" });
    expect(app.snapshot().exiting).toBe(true);
  });

  it("marks dead when initialize fails", async () => {
    const runtime = fakeRuntime();
    runtime.failStart = new Error("no lib/");
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
    });
    await app.start();
    expect(app.snapshot().agent).toBe("dead");
    expect(app.snapshot().notice?.tone).toBe("error");
  });

  it("/new changes session id and clears nodes", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      sessionId: "s1",
    });
    await app.start();
    runtime.emit({
      method: "session.event",
      params: {
        sessionId: "s1",
        event: {
          type: "user/message",
          seq: 1,
          time: 1,
          data: { id: "u1", content: [{ type: "text", text: "x" }] },
        },
      },
    });
    app.dispatch({ type: "command", line: "/new" });
    const snap = app.snapshot();
    expect(snap.header.sessionId).not.toBe("s1");
    expect(snap.nodes).toEqual([]);
  });

  it("edits the draft around a cursor", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
    });
    await app.start();
    app.dispatch({ type: "setDraft", text: "ac" });
    app.dispatch({ type: "moveCursor", delta: -1 });
    app.dispatch({ type: "insertDraft", text: "b" });
    expect(app.snapshot().composer).toMatchObject({ text: "abc", cursor: 2 });
    app.dispatch({ type: "deleteBackward" });
    expect(app.snapshot().composer).toMatchObject({ text: "ac", cursor: 1 });
  });

  it("marks the app dead when the runtime transport closes", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
    });
    await app.start();
    runtime.emitClose("stderr tail");
    expect(app.snapshot().agent).toBe("dead");
    expect(app.snapshot().composer.disabled).toBe(true);
    expect(app.snapshot().notice?.message).toMatch(/stderr tail/);
  });

  it("closes the runtime once for repeated quit actions", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
    });
    await app.start();
    app.dispatch({ type: "quit" });
    app.dispatch({ type: "quit" });
    await app.close();
    expect(runtime.closeCount).toBe(1);
    expect(app.snapshot().exiting).toBe(true);
  });

  it("shows the latest assistant usage without inventing zeroes", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      sessionId: "s1",
    });
    await app.start();
    runtime.emit({
      method: "session.event",
      params: {
        sessionId: "s1",
        event: {
          type: "assistant/message",
          seq: 1,
          time: 1,
          data: {
            turn: 1,
            step: 1,
            message: { content: [{ type: "text", text: "done" }] },
            usage: { inputTokens: 12, outputTokens: 4 },
          },
        },
      },
    });
    expect(app.snapshot().status.tokens).toEqual({ input: 12, output: 4 });
  });

  it("doctor redacts credentials and reports launch state", async () => {
    const runtime = fakeRuntime();
    runtime.failStart = new Error("API_KEY=sk-secret");
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "p",
      model: "m",
      diagnostics: {
        tty: true,
        launchConfigured: false,
        argsConfigured: true,
        sessionRoot: "/tmp/sessions",
      },
    });
    await app.start();
    app.dispatch({ type: "command", line: "/doctor" });
    const message = app.snapshot().notice?.message ?? "";
    expect(message).toMatch(/tty yes/);
    expect(message).toMatch(/launch unset/);
    expect(message).toMatch(/initialize error/);
    expect(message).not.toMatch(/sk-|API_KEY=|ck_live_/);
  });

  it("/status mentions auth mode and never prints a key", async () => {
    const runtime = fakeRuntime();
    const app = createTuiApp({
      runtime,
      cwd: "/tmp",
      provider: "deepseek-official",
      model: "deepseek-v4-flash",
      sessionId: "s1",
      auth: {
        mode: "byok",
        envLocked: true,
        accountLabel: "Ada",
        logout: async () => {},
      },
    });
    await app.start();
    app.dispatch({ type: "command", line: "/status" });
    const message = app.snapshot().notice?.message ?? "";
    expect(message).toMatch(/auth: byok/);
    expect(message).toMatch(/env-locked/);
    expect(message).toMatch(/account: Ada/);
    expect(message).not.toMatch(/sk-|ck_live_|API_KEY=/);
  });
});
