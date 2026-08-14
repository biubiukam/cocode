import type { Context } from '@deepseek-ai/cordis'
import { ShortcutRegistry } from '../../runtime/shortcuts/registry.ts'

export const name = 'shortcuts'

export function apply(ctx: Context) {
  const platform = ctx.get('platform') === 'electron' ? 'electron' : 'browser'
  new ShortcutRegistry(ctx, platform)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    platform: 'electron' | 'browser'
  }
}
