/**
 * The model-visible surface.
 *
 * Deliberately five narrow tools instead of one general-purpose browser tool:
 * fewer choices means fewer wrong choices, and no tool here can evaluate
 * arbitrary JavaScript in the page.
 */
import { defineTool } from "@deepseek-ai/dsh-tools"
import type { ToolDefinition } from "@deepseek-ai/dsh-tools"
import type { BrowserRuntime } from "./runtime.ts"
import { renderActionResult, renderSnapshot, renderTabs } from "./render.ts"
import { BrowserError, type BrowserAction } from "./protocol.ts"

export interface ToolRegistry {
  register(definition: ToolDefinition): () => void
}

export interface ToolsOptions {
  readonly runtime: BrowserRuntime
  /** Workspace directory for the calling agent, used to bound uploads. */
  readonly workspaceOf: (sessionId: string | undefined) => string | undefined
}

function failure(error: unknown): never {
  if (error instanceof BrowserError) throw new Error(`${error.code}: ${error.message}`)
  throw error
}

/** Reject a call early when there is no browser to drive at all. */
async function ensureEngine(runtime: BrowserRuntime): Promise<void> {
  const status = await runtime.probe()
  if (status.ready) return
  throw new Error(
    "BROWSER_CAPABILITY_UNAVAILABLE: no browser engine is available. "
    + (status.installable
      ? "Ask the user to open the Browser panel and install Chromium."
      : (status.message ?? "The browser engine could not be started.")),
  )
}

export function browserTools(options: ToolsOptions): readonly ToolDefinition[] {
  const { runtime } = options

  const tabs = defineTool({
    name: "browser_tabs",
    description: "List the browser tabs this session owns, with their URL, title and who currently drives each one.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { summary: { type: "string", required: true } },
      },
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    async execute() {
      await ensureEngine(runtime)
      return { summary: renderTabs(runtime.list()) }
    },
  })

  const open = defineTool({
    name: "browser_open",
    description: "Open a URL in the browser. Creates an agent-owned tab unless an existing agent tab is reused. Returns a snapshot of the loaded page.",
    parameters: {
      url: { type: "string", required: true, description: "Absolute http(s) URL, or a bare host that defaults to https." },
      tab_id: { type: "string", description: "Reuse this agent tab instead of opening a new one." },
      isolated: { type: "boolean", description: "Use the agent-only profile, which inherits none of the user's logins. Default false." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { tab_id: { type: "string", required: true }, summary: { type: "string", required: true } },
      },
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    async execute(args) {
      await ensureEngine(runtime)
      try {
        if (args.tab_id !== undefined) {
          await runtime.navigateAgent(args.tab_id, args.url)
          return { tab_id: args.tab_id, summary: renderSnapshot(await runtime.snapshot(args.tab_id)) }
        }
        const tab = await runtime.agentTab({ url: args.url, ...(args.isolated === undefined ? {} : { isolated: args.isolated }) })
        return { tab_id: tab.id, summary: renderSnapshot(await runtime.snapshot(tab.id)) }
      } catch (error) { return failure(error) }
    },
  })

  const snapshot = defineTool({
    name: "browser_snapshot",
    description: "Read the current page: URL, title and an accessibility outline whose refs address elements for browser_act. Large pages are truncated, and the truncation is reported.",
    parameters: {
      tab_id: { type: "string", required: true, description: "Tab to read." },
      screenshot: { type: "boolean", description: "Also attach a JPEG screenshot. Off by default because the outline is usually enough." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { summary: { type: "string", required: true }, generation: { type: "number", required: true } },
      },
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    async execute(args) {
      await ensureEngine(runtime)
      try {
        const value = await runtime.snapshot(args.tab_id, { screenshot: args.screenshot === true })
        return { summary: renderSnapshot(value), generation: value.generation }
      } catch (error) { return failure(error) }
    },
  })

  const act = defineTool({
    name: "browser_act",
    description: "Perform one action on a page and return what changed. Refs come from the most recent snapshot of the same tab; if the page moved on, the call fails instead of acting on the wrong element.",
    parameters: {
      tab_id: { type: "string", required: true },
      action: {
        type: "string",
        required: true,
        enum: ["click", "hover", "type", "press", "scroll", "select", "navigate", "upload", "dialog", "wait"],
      },
      ref: { type: "string", description: "Target element ref from the latest snapshot." },
      text: { type: "string", description: "Text for type, or the reply for a prompt dialog." },
      key: { type: "string", description: "Key name for press, for example Enter or Escape." },
      values: { type: "array", items: { type: "string" }, description: "Option values for select." },
      paths: { type: "array", items: { type: "string" }, description: "Workspace file paths for upload." },
      direction: { type: "string", enum: ["up", "down"], description: "Scroll direction." },
      amount: { type: "number", description: "Scroll distance in pixels." },
      to: { type: "string", enum: ["back", "forward", "reload"], description: "History move for navigate." },
      condition: { type: "string", enum: ["load", "network-idle", "text", "url"], description: "Condition for wait." },
      value: { type: "string", description: "Expected text or URL fragment for wait." },
      accept: { type: "boolean", description: "Whether to accept a pending dialog." },
      clear: { type: "boolean", description: "Clear the field before typing." },
      submit: { type: "boolean", description: "Press Enter after typing. Counts as a side effect." },
      generation: { type: "number", description: "Generation of the snapshot the refs came from. Recommended." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { summary: { type: "string", required: true }, generation: { type: "number", required: true } },
      },
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    async execute(args, exec) {
      await ensureEngine(runtime)
      const action = toAction(args)
      try {
        const result = await runtime.act(args.tab_id, action, {
          ...(args.generation === undefined ? {} : { expectedGeneration: args.generation }),
          ...(() => {
            const workspace = options.workspaceOf(exec.agent?.id as string | undefined)
            return workspace === undefined ? {} : { workspace }
          })(),
        })
        return { summary: renderActionResult(result), generation: result.generation }
      } catch (error) { return failure(error) }
    },
  })

  const close = defineTool({
    name: "browser_close",
    description: "Close a browser tab this session owns.",
    parameters: { tab_id: { type: "string", required: true } },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { closed: { type: "boolean", required: true } },
      },
      render: (args, value) => [{ type: "text", text: value.closed ? `Closed ${String(args.tab_id)}.` : `${String(args.tab_id)} was already closed.` }],
    },
    async execute(args) {
      const existed = runtime.list().some(tab => tab.id === args.tab_id)
      await runtime.releaseScreencast(args.tab_id)
      await runtime.tabs.close(args.tab_id)
      return { closed: existed }
    },
  })

  return [tabs, open, snapshot, act, close]
}

interface ActArgs {
  readonly action: string
  readonly ref?: string
  readonly text?: string
  readonly key?: string
  readonly values?: readonly string[]
  readonly paths?: readonly string[]
  readonly direction?: string
  readonly amount?: number
  readonly to?: string
  readonly condition?: string
  readonly value?: string
  readonly accept?: boolean
  readonly clear?: boolean
  readonly submit?: boolean
}

function requireRef(args: ActArgs): string {
  if (args.ref === undefined) throw new Error(`BROWSER_REF_NOT_FOUND: ${args.action} requires a ref from the latest snapshot.`)
  return args.ref
}

/** Flatten the tool's single argument object into the discriminated action. */
function toAction(args: ActArgs): BrowserAction {
  switch (args.action) {
    case "click":
      return { kind: "click", ref: requireRef(args) }
    case "hover":
      return { kind: "hover", ref: requireRef(args) }
    case "type": {
      if (args.text === undefined) throw new Error("type requires text.")
      return {
        kind: "type",
        ref: requireRef(args),
        text: args.text,
        ...(args.clear === undefined ? {} : { clear: args.clear }),
        ...(args.submit === undefined ? {} : { submit: args.submit }),
      }
    }
    case "press": {
      if (args.key === undefined) throw new Error("press requires a key.")
      return { kind: "press", key: args.key, ...(args.ref === undefined ? {} : { ref: args.ref }) }
    }
    case "scroll":
      return {
        kind: "scroll",
        direction: args.direction === "up" ? "up" : "down",
        ...(args.amount === undefined ? {} : { amount: args.amount }),
        ...(args.ref === undefined ? {} : { ref: args.ref }),
      }
    case "select": {
      if (args.values === undefined || args.values.length === 0) throw new Error("select requires values.")
      return { kind: "select", ref: requireRef(args), values: args.values }
    }
    case "navigate":
      return { kind: "navigate", to: args.to === "back" ? "back" : args.to === "forward" ? "forward" : "reload" }
    case "upload": {
      if (args.paths === undefined || args.paths.length === 0) throw new Error("upload requires paths.")
      return { kind: "upload", ref: requireRef(args), paths: args.paths }
    }
    case "dialog":
      return { kind: "dialog", accept: args.accept === true, ...(args.text === undefined ? {} : { text: args.text }) }
    case "wait":
      return {
        kind: "wait",
        condition: args.condition === "load" || args.condition === "network-idle" || args.condition === "text" || args.condition === "url" ? args.condition : "load",
        ...(args.value === undefined ? {} : { value: args.value }),
      }
    default:
      throw new Error(`Unknown browser action: ${args.action}`)
  }
}
