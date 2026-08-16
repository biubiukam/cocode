import type { Context } from "./context-types.ts"
import { liftDsmlToolCalls } from "./lift.ts"

export { liftDsmlToolCalls } from "./lift.ts"
export { DsmlExtractor } from "./dsml.ts"
export type { DsmlEvent } from "./dsml.ts"

export const name = "cocode-dsml"
export const inject = ["llm"]

/**
 * Wrap every model stream so DeepSeek tool calls that arrive as DSML markup
 * still reach the loop.
 *
 * V4 can emit a tool call as markup inside its thinking channel instead of the
 * structured field. Left alone the call never runs and the raw tags render as
 * reasoning text, which is why this sits at the LLM seam rather than in one
 * client: both the desktop app and the terminal client read the same stream.
 */
export function apply(ctx: Context): void {
  ctx.on("llm/stream", (_options, next) => liftDsmlToolCalls(next()), { global: true })
}
