import type { Context } from '@deepseek-ai/cordis'
import { PluginSettingsStore } from '../../runtime/plugin-settings/store.ts'

export const name = 'plugin-settings'
export const inject = ['connection']

export function apply(ctx: Context) {
  const store = new PluginSettingsStore(() => ctx.root.get('connection')?.activeTransport)
  ctx.reflect.provide('pluginSettings', store)
  ctx.on('credentials/updated', (...args) => { store.handleCredentialUpdated(args) })
  ctx.on('settings/document-updated', () => { void store.loadSettings() })
  ctx.on('connection/ready', () => { store.reset() })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginSettings: PluginSettingsStore
  }
}
