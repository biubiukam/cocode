import type { Context } from '@deepseek-ai/cordis'
import { ProviderAvailabilityStore } from '../../runtime/providers/store.ts'

export const name = 'providers'
export const inject = ['connection']

export function apply(ctx: Context) {
  const store = new ProviderAvailabilityStore(() => ctx.root.get('connection')?.activeTransport)
  ctx.reflect.provide('providers', store)
  ctx.on('credentials/updated', () => { void store.refresh() })
  ctx.on('settings/document-updated', () => { void store.refresh() })
  ctx.on('llm/adapters-updated', () => { void store.refresh() })
  ctx.on('connection/ready', () => { void store.refresh() })
  ctx.on('connection/lost', () => { store.reset() })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    providers: ProviderAvailabilityStore
  }
}
