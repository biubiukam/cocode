/**
 * Panel presentation types live in `./types.ts`.
 * Registration is per-plugin via `ctx.panels.register` — this file is not a roster.
 */

export type { AnyPanelDefinition, PanelDefinition, PanelProps } from './types.ts'
export { definePanel } from './types.ts'
