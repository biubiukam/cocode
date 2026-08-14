import type { Context } from '@deepseek-ai/cordis'
import { CommandCatalog } from '../../runtime/commands/catalog.ts'

export const name = 'commands'
export const inject = ['connection']

export function apply(ctx: Context) {
  const catalog = new CommandCatalog(() => ctx.root.get('connection')?.activeTransport)
  ctx.reflect.provide('commands', catalog)
  ctx.on('commands/change', () => { catalog.invalidate() })
  ctx.on('connection/ready', () => { catalog.invalidate() })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    commands: CommandCatalog
  }
}
