import type { Context } from '@deepseek-ai/cordis'
import { PanelRegistry } from '../../runtime/panels/registry.ts'

export const name = 'panels'

export function apply(ctx: Context) {
  new PanelRegistry(ctx)
}
