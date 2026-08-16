/**
 * Host wiring: one runtime, one frame channel, five tools.
 *
 * Everything is lazy. Probing for a browser costs a few filesystem checks and
 * launching one only happens when a panel attaches or an agent calls a tool,
 * so a session that never opens the browser pays nothing.
 */
import type { WorkbenchContext } from "../host-types.ts"
import { resolveSessionCwd } from "../session-cwd.ts"
import { BrowserRuntime } from "./runtime.ts"
import { createBrowserStream } from "./stream.ts"
import { browserTools } from "./tools.ts"

/** Our own origin, which a page must never be able to reach. */
function selfOrigins(ctx: WorkbenchContext): readonly string[] {
  const port = ctx.webServer.port
  if (port === undefined) return []
  const authorities = ["127.0.0.1", "localhost", "[::1]"]
  const configured = ctx.webServer.host
  if (configured !== undefined && configured !== "" && !authorities.includes(configured)) authorities.push(configured)
  return authorities.flatMap(authority => [`http://${authority}:${String(port)}`, `https://${authority}:${String(port)}`])
}

export function applyBrowserHost(ctx: WorkbenchContext): BrowserRuntime {
  const workspaceOf = (sessionId: string | undefined): string | undefined => {
    try { return resolveSessionCwd(ctx, sessionId) } catch { return undefined }
  }

  const attachments = ctx.get("attachments")
  const runtime = new BrowserRuntime({
    policy: { blockedOrigins: selfOrigins(ctx) },
    ...(attachments === undefined ? {} : { attachments }),
  })

  const stream = createBrowserStream({ runtime, workspaceOf })
  ctx.effect(() => {
    const dispose = ctx.webServer.registerUpgrade({ path: stream.path, handler: stream.handler })
    return () => { stream.dispose(); dispose() }
  }, "cocode-workbench: browser stream")

  const tools = ctx.get("tools")
  if (tools !== undefined) {
    for (const definition of browserTools({ runtime, workspaceOf })) {
      ctx.effect(() => tools.register(definition), `cocode-workbench: ${definition.name}`)
    }
  }

  ctx.effect(() => () => { void runtime.dispose() }, "cocode-workbench: browser runtime")
  return runtime
}
