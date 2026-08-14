import { describe, expect, it } from "vitest";
import type { TuiNotification, TuiRuntime } from "@cocode/tui-connection";
import { createTuiApp } from "../../src/runtime/app.ts";

function fakeRuntime(): TuiRuntime & {
  prompts: { sessionId: string; text: string }[];
  emit: (n: TuiNotification) => void;
  failStart?: Error;
} {
  const handlers = new Set<(n: TuiNotification) => void>();
  const runtime: TuiRuntime & {
    prompts: { sessionId: string; text: string }[];
    emit: (n: TuiNotification) => void;
    failStart?: Error;
  } = {
    prompts: [],
    emit(n) {
      for (const handler of handlers) handler(n);
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
    async close() {},
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
});
