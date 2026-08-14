/**
 * Host-plane plugin settings and the read-only Loader inventory.
 *
 * The three cards this store serves are a fixed allowlist — a namespace that
 * appears in `settings.describe` but is not one of these is ignored. Drafts
 * live in the presentation layer so a Host refresh cannot overwrite what the
 * user is still editing.
 */

import {
  type CredentialView,
  type HarnessTransport,
  type PluginInventoryEntry,
  type SettingsNamespaceView,
  type SettingsPathOp,
} from '@cocode/gui-connection'
import { Notifier } from '../notifier.ts'

export const PLUGIN_SETTING_NAMESPACES = ['shell', 'agent-loop', 'web-search-deepseek'] as const
export type PluginSettingsNamespace = (typeof PLUGIN_SETTING_NAMESPACES)[number]

/** Credential the search provider resolves when the section names none. */
export const DEFAULT_WEB_SEARCH_API_KEY_REF = 'DEEPSEEK_API_KEY'

export type PluginSection = {
  ns: PluginSettingsNamespace
  value: Record<string, unknown>
  base: Record<string, unknown> | undefined
  user: Record<string, unknown> | undefined
  revision: number
}

export type PluginCredential = {
  ref: string
  configured: boolean
  writable: boolean
}

export type PluginSettingsSnapshot = {
  settingsStatus: 'idle' | 'loading' | 'ready' | 'error'
  writable: boolean
  sections: Partial<Record<PluginSettingsNamespace, PluginSection>>
  credential: PluginCredential
  inventoryStatus: 'idle' | 'loading' | 'ready' | 'error'
  inventory: readonly PluginInventoryEntry[]
}

const EMPTY_CREDENTIAL: PluginCredential = {
  ref: DEFAULT_WEB_SEARCH_API_KEY_REF,
  configured: false,
  writable: true,
}

function emptySnapshot(): PluginSettingsSnapshot {
  return {
    settingsStatus: 'idle',
    writable: true,
    sections: {},
    credential: EMPTY_CREDENTIAL,
    inventoryStatus: 'idle',
    inventory: [],
  }
}

function isPluginNamespace(ns: string): ns is PluginSettingsNamespace {
  return (PLUGIN_SETTING_NAMESPACES as readonly string[]).includes(ns)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function sectionOf(view: SettingsNamespaceView): PluginSection | undefined {
  if (!isPluginNamespace(view.ns)) return undefined
  return {
    ns: view.ns,
    value: asRecord(view.value) ?? {},
    base: asRecord(view.base),
    user: asRecord(view.user),
    revision: view.revision,
  }
}

/** The credential reference the search section currently names. */
export function webSearchApiKeyRef(section: PluginSection | undefined): string {
  const declared = section?.value.apiKeyEnv
  return typeof declared === 'string' && declared.length > 0 ? declared : DEFAULT_WEB_SEARCH_API_KEY_REF
}

export class PluginSettingsStore {
  private readonly notifier = new Notifier()
  private snapshot = emptySnapshot()
  private settingsGeneration = 0
  private inventoryGeneration = 0

  constructor(private readonly getTransport: () => HarnessTransport | undefined) {}

  /** Applies a forwarded `credentials/updated` payload. */
  handleCredentialUpdated(args: readonly unknown[]): void {
    const ref = args[0]
    if (typeof ref === 'string') void this.refreshCredential(ref)
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener)
  }

  getSnapshot(): PluginSettingsSnapshot {
    return this.snapshot
  }

  /** Drops Host-derived state. Drafts are presentation-owned and die with the page. */
  reset(): void {
    this.settingsGeneration += 1
    this.inventoryGeneration += 1
    this.replace(emptySnapshot())
  }

  async loadSettings(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    const generation = this.settingsGeneration + 1
    this.settingsGeneration = generation
    this.replace({ ...this.snapshot, settingsStatus: this.snapshot.settingsStatus === 'ready' ? 'ready' : 'loading' })

    const result = await transport.call('settings.describe', {})
    if (generation !== this.settingsGeneration) return
    if (!result.ok) {
      this.replace({ ...this.snapshot, settingsStatus: 'error' })
      return
    }

    const sections: PluginSettingsSnapshot['sections'] = {}
    for (const view of result.value.namespaces) {
      const section = sectionOf(view)
      if (section !== undefined) sections[section.ns] = section
    }
    this.replace({
      ...this.snapshot,
      settingsStatus: 'ready',
      writable: result.value.writable,
      sections,
    })
    await this.refreshCredential()
  }

  async loadInventory(): Promise<void> {
    if (this.snapshot.inventoryStatus === 'loading' || this.snapshot.inventoryStatus === 'ready') return
    await this.fetchInventory()
  }

  async retryInventory(): Promise<void> {
    await this.fetchInventory()
  }

  /**
   * Path-addressed edits to one card's namespace. A conflict re-reads then fails
   * so the presentation can keep its drafts.
   */
  async mutate(ns: PluginSettingsNamespace, ops: SettingsPathOp[]): Promise<boolean> {
    const transport = this.getTransport()
    const section = this.snapshot.sections[ns]
    if (transport === undefined || section === undefined || ops.length === 0) return false

    const result = await transport.call('settings.mutate', {
      ns,
      ops,
      expectedRevision: section.revision,
    })
    if (result.ok) {
      const next = sectionOf(result.value)
      if (next === undefined) return false
      this.replace({ ...this.snapshot, sections: { ...this.snapshot.sections, [ns]: next } })
      return true
    }
    if (result.error.code === 'settings-conflict') await this.loadSettings()
    return false
  }

  /** Writes a search key. An empty value is a no-op so a blank save keeps the stored key. */
  async writeCredential(value: string): Promise<boolean> {
    const trimmed = value.trim()
    if (trimmed === '') return true
    const transport = this.getTransport()
    if (transport === undefined) return false
    const ref = this.snapshot.credential.ref
    const result = await transport.call('credentials.set', { ref, value: trimmed })
    await this.refreshCredential(ref)
    return result.ok && this.snapshot.credential.configured
  }

  private async fetchInventory(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    const generation = this.inventoryGeneration + 1
    this.inventoryGeneration = generation
    this.replace({ ...this.snapshot, inventoryStatus: 'loading' })

    const result = await transport.callRemote('pluginInventory/list', {})
    if (generation !== this.inventoryGeneration) return
    if (!result.ok) {
      this.replace({ ...this.snapshot, inventoryStatus: 'error', inventory: [] })
      return
    }
    this.replace({ ...this.snapshot, inventoryStatus: 'ready', inventory: result.value.entries })
  }

  private async refreshCredential(changedRef?: string): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    const ref = webSearchApiKeyRef(this.snapshot.sections['web-search-deepseek'])
    if (changedRef !== undefined && changedRef !== ref) return

    if (this.snapshot.credential.ref !== ref) {
      this.replace({ ...this.snapshot, credential: { ref, configured: false, writable: true } })
    }

    const result = await transport.call('credentials.describe', { refs: [ref] })
    if (!result.ok || webSearchApiKeyRef(this.snapshot.sections['web-search-deepseek']) !== ref) return
    const view: CredentialView | undefined = result.value.credentials[ref]
    this.replace({
      ...this.snapshot,
      credential: {
        ref,
        configured: view?.configured ?? false,
        writable: view?.writable ?? true,
      },
    })
  }

  private replace(next: PluginSettingsSnapshot): void {
    this.snapshot = next
    this.notifier.markDirty()
  }
}
