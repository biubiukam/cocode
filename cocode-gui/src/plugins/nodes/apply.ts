import type { Context } from '@deepseek-ai/cordis'
import { NodeRegistry } from '../../runtime/nodes/registry.ts'

export const name = 'nodes'

export function apply(ctx: Context) {
  new NodeRegistry(ctx)
}
