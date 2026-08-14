/**
 * TuiApp owns session lifecycle, projection, and local queues.
 */

import type { TuiNotification, TuiRuntime } from "@cocode/tui-connection";
import { createAssembler, type Assembler } from "./assembler.ts";
import { P0_CAPABILITIES, type TuiCapabilities } from "./capabilities.ts";
import {
  CommandRegistry,
  createBuiltinCommands,
  helpText,
  parseSlash,
} from "./commands.ts";
import { InputHistory } from "./history.ts";
import type { ConversationNode } from "./nodes/types.ts";

export type TuiAction =
  | { type: "submit"; text: string }
  | { type: "command"; line: string }
  | { type: "setDraft"; text: string }
  | { type: "historyPrev" }
  | { type: "historyNext" }
  | { type: "toggleVerbose" }
  | { type: "toggleHelp" }
  | { type: "interruptOrQuit" }
  | { type: "quit" };

export type { TuiCapabilities };

export type TuiSnapshot = {
  header: {
    product: "Cocode";
    sessionId: string;
    model: string;
    provider: string;
    cwd: string;
  };
  agent: "idle" | "running" | "starting" | "dead";
  nodes: readonly ConversationNode[];
  composer: { text: string; placeholder: string; disabled: boolean };
  status: { line: string };
  helpOpen: boolean;
  verbose: boolean;
  capabilities: TuiCapabilities;
  notice?: { tone: "info" | "error"; message: string };
  helpText: string;
  exiting: boolean;
};

export type TuiCommandCtx = {
  dispatch: (action: TuiAction) => void;
  newSession: () => void;
  clearTranscript: () => void;
  showStatus: () => void;
  notice: (tone: "info" | "error", message: string) => void;
};

export type TuiApp = {
  start(): Promise<void>;
  close(): Promise<void>;
  snapshot(): TuiSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(action: TuiAction): void;
};

export type TuiAppOptions = {
  runtime: TuiRuntime;
  cwd: string;
  provider: string;
  model: string;
  sessionId?: string;
  capabilities?: TuiCapabilities;
  commands?: CommandRegistry;
};

export function createTuiApp(options: TuiAppOptions): TuiApp {
  return new TuiAppImpl(options);
}

class TuiAppImpl implements TuiApp {
  private readonly runtime: TuiRuntime;
  private readonly cwd: string;
  private readonly provider: string;
  private readonly model: string;
  private readonly capabilities: TuiCapabilities;
  private readonly commands: CommandRegistry;
  private readonly assembler: Assembler;
  private readonly history = new InputHistory();
  private readonly listeners = new Set<() => void>();
  private unsubscribeRuntime: (() => void) | undefined;
  private sessionId: string;
  private agent: TuiSnapshot["agent"] = "starting";
  private draft = "";
  private helpOpen = false;
  private verbose = false;
  private notice: TuiSnapshot["notice"];
  private interruptArmed = false;
  private exiting = false;
  private runtimeName = "";

  constructor(options: TuiAppOptions) {
    this.runtime = options.runtime;
    this.cwd = options.cwd;
    this.provider = options.provider;
    this.model = options.model;
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    this.capabilities = options.capabilities ?? P0_CAPABILITIES;
    this.commands = options.commands ?? createBuiltinCommands();
    this.assembler = createAssembler();
  }

  async start(): Promise<void> {
    this.agent = "starting";
    this.emit();
    this.unsubscribeRuntime = this.runtime.subscribe((n) =>
      this.onNotification(n),
    );
    try {
      const info = await this.runtime.start({
        cwd: this.cwd,
        provider: this.provider,
        model: this.model,
      });
      this.runtimeName = info.name;
      this.agent = "idle";
      this.notice = {
        tone: "info",
        message: `Connected ${info.name} ${info.version}`,
      };
    } catch (error) {
      this.agent = "dead";
      this.notice = {
        tone: "error",
        message: startErrorMessage(error),
      };
    }
    this.emit();
  }

  async close(): Promise<void> {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = undefined;
    await this.runtime.close();
  }

  snapshot(): TuiSnapshot {
    const disabled = this.agent === "dead" || this.exiting;
    return {
      header: {
        product: "Cocode",
        sessionId: this.sessionId,
        model: this.model,
        provider: this.provider,
        cwd: this.cwd,
      },
      agent: this.agent,
      nodes: this.assembler.snapshot(),
      composer: {
        text: this.draft,
        placeholder: composerPlaceholder(this.agent),
        disabled,
      },
      status: { line: statusLine(this.agent, this.runtimeName) },
      helpOpen: this.helpOpen,
      verbose: this.verbose,
      capabilities: this.capabilities,
      notice: this.notice,
      helpText: helpText(this.capabilities, this.commands),
      exiting: this.exiting,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispatch(action: TuiAction): void {
    switch (action.type) {
      case "setDraft":
        this.draft = action.text;
        this.emit();
        return;
      case "submit":
        this.submit(action.text);
        return;
      case "command":
        this.runCommand(action.line);
        return;
      case "historyPrev": {
        const next = this.history.prev(this.draft);
        if (next !== undefined) this.draft = next;
        this.emit();
        return;
      }
      case "historyNext": {
        const next = this.history.next(this.draft);
        if (next !== undefined) this.draft = next;
        this.emit();
        return;
      }
      case "toggleVerbose":
        this.verbose = !this.verbose;
        this.emit();
        return;
      case "toggleHelp":
        this.helpOpen = !this.helpOpen;
        this.emit();
        return;
      case "interruptOrQuit":
        this.interruptOrQuit();
        return;
      case "quit":
        this.beginQuit();
        return;
    }
  }

  private interruptOrQuit(): void {
    if (this.helpOpen) {
      this.helpOpen = false;
      this.emit();
      return;
    }
    if (this.agent === "running" && !this.capabilities.cancel) {
      if (!this.interruptArmed) {
        this.interruptArmed = true;
        this.notice = {
          tone: "info",
          message:
            "Protocol cannot cancel. Press again to quit and kill the runtime.",
        };
        this.emit();
        return;
      }
      this.beginQuit();
      return;
    }
    if (!this.interruptArmed) {
      this.interruptArmed = true;
      this.notice = { tone: "info", message: "Press again to quit." };
      this.emit();
      return;
    }
    this.beginQuit();
  }

  private commandCtx(): TuiCommandCtx {
    return {
      dispatch: (action) => this.dispatch(action),
      newSession: () => {
        this.sessionId = crypto.randomUUID();
        this.assembler.reset();
        this.notice = {
          tone: "info",
          message: `New session ${this.sessionId}`,
        };
        this.emit();
      },
      clearTranscript: () => {
        this.assembler.reset();
        this.notice = { tone: "info", message: "Transcript cleared" };
        this.emit();
      },
      showStatus: () => {
        this.notice = {
          tone: "info",
          message: [
            `session ${this.sessionId}`,
            `${this.provider}/${this.model}`,
            this.agent,
            this.runtimeName === "" ? "runtime offline" : this.runtimeName,
          ].join(" · "),
        };
        this.emit();
      },
      notice: (tone, message) => {
        this.notice = { tone, message };
        this.emit();
      },
    };
  }

  private submit(text: string): void {
    const trimmed = text.trim();
    if (trimmed === "") return;
    if (trimmed.startsWith("/")) {
      this.runCommand(trimmed);
      return;
    }
    if (this.agent !== "idle") {
      this.notice = {
        tone: "info",
        message: "Turn in progress. Protocol cannot queue or steer yet.",
      };
      this.emit();
      return;
    }
    this.history.push(trimmed);
    this.draft = "";
    this.notice = undefined;
    this.interruptArmed = false;
    void this.runtime
      .prompt(this.sessionId, [{ type: "text", text: trimmed }])
      .catch((error: unknown) => {
        this.notice = { tone: "error", message: errorMessage(error) };
        if (this.agent === "running") this.agent = "idle";
        this.emit();
      });
    this.emit();
  }

  private runCommand(line: string): void {
    const parsed = parseSlash(line);
    if (parsed === null) {
      this.notice = { tone: "error", message: "Not a command" };
      this.emit();
      return;
    }
    const command = this.commands.find(parsed.name, this.capabilities);
    if (command === undefined) {
      this.notice = {
        tone: "error",
        message: `Unknown command /${parsed.name}`,
      };
      this.emit();
      return;
    }
    this.draft = "";
    this.history.push(line);
    command.run(this.commandCtx(), parsed.args);
  }

  private onNotification(notification: TuiNotification): void {
    if (notification.method === "session.event") {
      if (notification.params.sessionId !== this.sessionId) return;
      this.assembler.ingest(notification.params.event);
      this.emit();
      return;
    }
    if (notification.method === "session.status") {
      if (notification.params.sessionId !== this.sessionId) return;
      if (this.agent === "dead" || this.exiting) return;
      this.agent = notification.params.status;
      this.interruptArmed = false;
      this.emit();
      return;
    }
    if (notification.method === "subagent.started") {
      if (notification.params.parentSessionId !== this.sessionId) return;
      this.notice = {
        tone: "info",
        message: `Subagent ${notification.params.childSessionId}`,
      };
      this.emit();
      return;
    }
    if (notification.params.parentSessionId !== this.sessionId) return;
    this.notice = {
      tone: "info",
      message: `Subagent finished ${notification.params.childSessionId}`,
    };
    this.emit();
  }

  private beginQuit(): void {
    if (this.exiting) return;
    this.exiting = true;
    this.emit();
    void this.close().finally(() => {
      this.agent = "dead";
      this.emit();
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function composerPlaceholder(agent: TuiSnapshot["agent"]): string {
  if (agent === "starting") return "Connecting…";
  if (agent === "running") return "Working — Esc then again to quit";
  if (agent === "dead") return "Runtime stopped — /exit";
  return "Type a message  / for commands";
}

function statusLine(agent: TuiSnapshot["agent"], runtimeName: string): string {
  const name = runtimeName === "" ? "runtime" : runtimeName;
  if (agent === "running") {
    return `${name} · running · protocol cannot cancel`;
  }
  return `${name} · ${agent}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startErrorMessage(error: unknown): string {
  return [
    "Initialize failed. Build sibling cocode-harness (pnpm run build),",
    "set COCODE_HARNESS_ARGS, then /exit.",
    errorMessage(error),
  ].join(" ");
}
