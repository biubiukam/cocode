/**
 * Derives the BYOK gallery from `llm.providers` + settings + credentials.
 *
 * One card is one configurable provider. "Can run" is a configured secret, or
 * an active route that declares no secret slot.
 */

import {
  type ConfigurableProviderView,
  type CredentialView,
  type HarnessTransport,
  type SettingsNamespaceView,
} from '@cocode/gui-connection'
import { Observable } from '../notifier.ts'

export const COCODE_CLOUD_PROVIDER = 'cocode-cloud'
export const COCODE_CLOUD_KEY_REF = 'COCODE_CLOUD_API_KEY'
export const LLM_PI_AI_NS = 'llm-pi-ai'

export type ProviderCardStatus = 'configured' | 'env' | 'no-key' | 'missing'

export type ProviderCard = {
  provider: string
  displayName: string
  settingsNs: string
  settingsPath: string[]
  active: boolean
  apiKeyEnv?: string
  baseURL?: string
  credential?: CredentialView
  status: ProviderCardStatus
  canRun: boolean
}

export type ProviderAvailabilitySnapshot = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  writable: boolean
  cards: readonly ProviderCard[]
  canRun: boolean
  namespaces: readonly SettingsNamespaceView[]
}

function emptySnapshot(): ProviderAvailabilitySnapshot {
  return { status: 'idle', writable: true, cards: [], canRun: false, namespaces: [] }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function atPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (record === undefined) return undefined
    current = record[key]
  }
  return current
}

function statusOf(card: {
  active: boolean
  apiKeyEnv?: string
  credential?: CredentialView
}): ProviderCardStatus {
  if (card.apiKeyEnv === undefined) return card.active ? 'no-key' : 'missing'
  if (card.credential?.configured !== true) return 'missing'
  if (card.credential.writable) return 'configured'
  return 'env'
}

export class ProviderAvailabilityStore {
  readonly state = new Observable<ProviderAvailabilitySnapshot>(emptySnapshot())
  private generation = 0

  constructor(private readonly getTransport: () => HarnessTransport | undefined) {}

  reset(): void {
    this.generation += 1
    this.state.set(emptySnapshot())
  }

  async refresh(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    const generation = this.generation + 1
    this.generation = generation
    const previous = this.state.get()
    this.state.set({ ...previous, status: previous.status === 'ready' ? 'ready' : 'loading' })

    const [providers, described] = await Promise.all([
      transport.call('llm.providers', {}),
      transport.call('settings.describe', {}),
    ])
    if (generation !== this.generation) return
    if (!providers.ok || !described.ok) {
      this.state.set({ ...this.state.get(), status: 'error' })
      return
    }

    const namespaces = described.value.namespaces
    const nsByName = new Map(namespaces.map(view => [view.ns, view]))
    const refs: string[] = []
    const drafts: Omit<ProviderCard, 'credential' | 'status' | 'canRun'>[] = providers.value.providers.map(row => {
      const profile = this.profileOf(row, nsByName.get(row.settingsNs))
      if (profile.apiKeyEnv !== undefined) refs.push(profile.apiKeyEnv)
      return profile
    })

    const credentials = refs.length === 0
      ? { credentials: {} as Record<string, CredentialView> }
      : await transport.call('credentials.describe', { refs }).then(result => (
          result.ok ? result.value : { credentials: {} as Record<string, CredentialView> }
        ))
    if (generation !== this.generation) return

    const cards = drafts.map(draft => {
      const credential = draft.apiKeyEnv === undefined ? undefined : credentials.credentials[draft.apiKeyEnv]
      const status = statusOf({ active: draft.active, apiKeyEnv: draft.apiKeyEnv, credential })
      const canRun = status === 'configured' || status === 'env' || status === 'no-key'
      return { ...draft, credential, status, canRun }
    })

    this.state.set({
      status: 'ready',
      writable: described.value.writable,
      cards,
      canRun: cards.some(card => card.canRun),
      namespaces,
    })
  }

  namespace(ns: string): SettingsNamespaceView | undefined {
    return this.state.get().namespaces.find(view => view.ns === ns)
  }

  private profileOf(
    row: ConfigurableProviderView,
    namespace: SettingsNamespaceView | undefined,
  ): Omit<ProviderCard, 'credential' | 'status' | 'canRun'> {
    const value = namespace === undefined ? undefined : atPath(namespace.value, row.settingsPath)
    const record = asRecord(value)
    const apiKeyEnv = typeof record?.apiKeyEnv === 'string' && record.apiKeyEnv !== '' ? record.apiKeyEnv : undefined
    const baseURL = typeof record?.baseURL === 'string' && record.baseURL !== '' ? record.baseURL : undefined
    return {
      provider: row.provider,
      displayName: row.displayName,
      settingsNs: row.settingsNs,
      settingsPath: row.settingsPath,
      active: row.active,
      ...apiKeyEnv === undefined ? {} : { apiKeyEnv },
      ...baseURL === undefined ? {} : { baseURL },
    }
  }
}
