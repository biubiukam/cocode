import type { Context } from '@deepseek-ai/cordis'
import { ConnectionBanner, ConnectionSplash } from '../../shell/connection-gate.tsx'

export const name = 'connection-gate'
export const inject = ['slots']

export function apply(ctx: Context) {
  ctx.slots.register({ name: 'shell.overlay', order: 0 }, ConnectionSplash)
  ctx.slots.register({ name: 'shell.overlay', order: 1 }, ConnectionBanner)
}
