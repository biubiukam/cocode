export const COCODE_WORKBENCH_PLUGIN = "cocode-workbench"
export const name = COCODE_WORKBENCH_PLUGIN
/**
 * Only what the workbench cannot run without. `tools` and `attachments` are
 * read through `ctx.get` instead: without the tool runtime the browser is
 * still fully usable by the human, and without an attachment store the agent
 * simply cannot request screenshots.
 */
export const inject = ["webServer", "sessions"]
export type { WorkbenchContext } from "./host-types.ts"
import { applyWorkbenchHost } from "./host-api.ts"
import { applyTerminalHost } from "./terminal-host.ts"
import { registerWorkbenchSettings } from "./settings.ts"

export { WORKBENCH_SETTINGS_NAMESPACE, WorkbenchSettingsSchema } from "./settings.ts"
export type { CommitMessageSettings, WorkbenchSettings } from "./settings.ts"

export function apply(ctx: import("./host-types.ts").WorkbenchContext): void {
  registerWorkbenchSettings(ctx)
  applyWorkbenchHost(ctx)
  applyTerminalHost(ctx)
}
