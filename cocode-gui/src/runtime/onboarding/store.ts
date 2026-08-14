/**
 * First-run overlay state. Zero React: the host component subscribes and
 * passes snapshots into presentational cards.
 */

import type { HarnessTransport } from '@cocode/gui-connection'
import { Observable } from '../notifier.ts'
import type { CloudProvision } from '../account/store.ts'
import type { AccountStore } from '../account/store.ts'
import {
  COCODE_CLOUD_KEY_REF,
  COCODE_CLOUD_PROVIDER,
  LLM_PI_AI_NS,
  type ProviderAvailabilityStore,
  type ProviderCard,
} from '../providers/store.ts'

export const ONBOARDING_NS = 'ui-onboarding'
export const SETUP_VERSION = '2026-08-14'

export type OnboardingPane = 'fork' | 'gallery' | 'form' | 'skip-confirm'

export type OnboardingSnapshot = {
  open: boolean
  pane: OnboardingPane
  privileged: boolean
  loginAvailable: boolean
  selected?: string
  draftKey: string
  draftEndpoint: string
  endpointOpen: boolean
  busy: boolean
  error?: string
  loginHint?: string
}

function closed(): OnboardingSnapshot {
  return {
    open: false,
    pane: 'fork',
    privileged: false,
    loginAvailable: false,
    draftKey: '',
    draftEndpoint: '',
    endpointOpen: false,
    busy: false,
  }
}

function loopback(baseUrl: string): boolean {
  try {
    const href = (globalThis as { location?: { href?: string } }).location?.href
    const url = new URL(baseUrl === '' ? (href ?? 'http://127.0.0.1/') : baseUrl)
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  }
  catch {
    return false
  }
}

export class OnboardingStore {
  readonly state = new Observable<OnboardingSnapshot>(closed())
  private forced = false
  private skipped = false
  private drafts = new Map<string, { key: string; endpoint: string }>()

  constructor(
    private readonly getTransport: () => HarnessTransport | undefined,
    private readonly getBaseUrl: () => string,
    private readonly account: AccountStore,
    private readonly providers: ProviderAvailabilityStore,
  ) {
    account.state.subscribe(() => { void this.reconsider() })
    providers.state.subscribe(() => { void this.reconsider() })
  }

  onConnectionReady(): void {
    void this.providers.refresh()
    void this.reconsider()
  }

  onConnectionLost(): void {
    this.forced = false
    this.state.set({ ...this.state.get(), open: false, busy: false })
  }

  replay(): void {
    this.forced = true
    this.skipped = false
    this.patch({ open: true, pane: 'fork', error: undefined, loginHint: undefined })
  }

  close(): void {
    this.forced = false
    this.account.cancelSignIn()
    this.patch({ open: false, pane: 'fork', busy: false, error: undefined, selected: undefined, loginHint: undefined })
  }

  showFork(): void {
    this.patch({ pane: 'fork', error: undefined, selected: undefined })
  }

  showGallery(): void {
    this.patch({ pane: 'gallery', error: undefined })
  }

  selectProvider(provider: string): void {
    const card = this.card(provider)
    const draft = this.drafts.get(provider)
    this.patch({
      pane: 'form',
      selected: provider,
      draftKey: draft?.key ?? '',
      draftEndpoint: draft?.endpoint ?? card?.baseURL ?? '',
      endpointOpen: false,
      error: undefined,
    })
  }

  setDraftKey(value: string): void {
    const selected = this.state.get().selected
    this.patch({ draftKey: value })
    if (selected !== undefined) {
      const previous = this.drafts.get(selected)
      this.drafts.set(selected, { key: value, endpoint: previous?.endpoint ?? this.state.get().draftEndpoint })
    }
  }

  setDraftEndpoint(value: string): void {
    const selected = this.state.get().selected
    this.patch({ draftEndpoint: value })
    if (selected !== undefined) {
      const previous = this.drafts.get(selected)
      this.drafts.set(selected, { key: previous?.key ?? this.state.get().draftKey, endpoint: value })
    }
  }

  toggleEndpoint(): void {
    this.patch({ endpointOpen: !this.state.get().endpointOpen })
  }

  requestSkip(): void {
    this.patch({ pane: 'skip-confirm' })
  }

  cancelSkip(): void {
    this.patch({ pane: 'fork' })
  }

  async confirmSkip(): Promise<void> {
    await this.writeSetupVersion()
    if (this.state.get().error !== undefined) return
    this.skipped = true
    this.forced = false
    this.close()
  }

  async testAndSave(): Promise<void> {
    const snapshot = this.state.get()
    const card = snapshot.selected === undefined ? undefined : this.card(snapshot.selected)
    const transport = this.getTransport()
    if (card === undefined || transport === undefined) return
    if (card.credential?.writable === false) {
      this.patch({ error: '该凭证由环境提供，不能在这里覆盖。' })
      return
    }
    const apiKey = snapshot.draftKey.trim()
    if (card.apiKeyEnv !== undefined && apiKey === '' && card.credential?.configured !== true) {
      this.patch({ error: '请粘贴 API Key。' })
      return
    }
    this.patch({ busy: true, error: undefined })
    const discovered = await transport.call('llm.discoverModels', {
      settingsNs: card.settingsNs,
      provider: card.provider,
      ...snapshot.draftEndpoint.trim() === '' ? {} : { baseURL: snapshot.draftEndpoint.trim() },
      ...apiKey === '' ? {} : { apiKey },
    })
    if (!discovered.ok) {
      this.patch({ busy: false, error: discovered.error.message })
      return
    }
    if (card.apiKeyEnv !== undefined && apiKey !== '') {
      const saved = await transport.call('credentials.set', { ref: card.apiKeyEnv, value: apiKey })
      if (!saved.ok) {
        this.patch({ busy: false, error: saved.error.message })
        return
      }
    }
    this.drafts.delete(card.provider)
    await this.providers.refresh()
    this.patch({ busy: false, pane: 'gallery', selected: undefined, draftKey: '' })
    if (this.providers.state.get().canRun) this.close()
  }

  async signOut(): Promise<void> {
    await this.unsetCloud()
    await this.account.signOut()
  }

  async signIn(): Promise<void> {
    this.patch({ busy: true, error: undefined, loginHint: undefined })
    try {
      if (this.account.state.get().profile === null) await this.account.signIn()
      const provisioned = await this.provisionCloud()
      if (provisioned) {
        this.close()
        return
      }
      this.patch({
        busy: false,
        pane: 'fork',
        loginHint: '账号已登录，但托管模型还没写进本机。可以改用自己的 Key。',
      })
    }
    catch (error) {
      this.patch({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async provisionCloud(): Promise<boolean> {
    const transport = this.getTransport()
    if (transport === undefined) return false
    let provision: CloudProvision | null
    try {
      provision = await this.account.cloudProvision()
    }
    catch {
      return false
    }
    if (provision === null || provision.models.length === 0) return false
    const namespace = this.providers.namespace(LLM_PI_AI_NS)
    const mutated = await transport.call('settings.mutate', {
      ns: LLM_PI_AI_NS,
      expectedRevision: namespace?.revision,
      ops: [{
        op: 'set',
        path: ['providers', COCODE_CLOUD_PROVIDER],
        value: {
          displayName: 'Cocode Cloud',
          api: 'openai-responses',
          baseURL: `${provision.origin}/v1`,
          apiKeyEnv: COCODE_CLOUD_KEY_REF,
          models: provision.models.map(model => ({ id: model.id, name: model.name })),
        },
      }],
    })
    if (!mutated.ok) return false
    const saved = await transport.call('credentials.set', { ref: COCODE_CLOUD_KEY_REF, value: provision.apiKey })
    if (!saved.ok) return false
    const discovered = await transport.call('llm.discoverModels', {
      settingsNs: LLM_PI_AI_NS,
      provider: COCODE_CLOUD_PROVIDER,
      apiKey: provision.apiKey,
    })
    await this.providers.refresh()
    return discovered.ok && this.providers.state.get().canRun
  }

  async unsetCloud(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    await transport.call('credentials.unset', { ref: COCODE_CLOUD_KEY_REF })
    const namespace = this.providers.namespace(LLM_PI_AI_NS)
    if (namespace !== undefined) {
      await transport.call('settings.mutate', {
        ns: LLM_PI_AI_NS,
        expectedRevision: namespace.revision,
        ops: [{ op: 'unset', path: ['providers', COCODE_CLOUD_PROVIDER] }],
      })
    }
    await this.providers.refresh()
  }

  private card(provider: string): ProviderCard | undefined {
    return this.providers.state.get().cards.find(item => item.provider === provider)
  }

  private async reconsider(): Promise<void> {
    const transport = this.getTransport()
    const privileged = loopback(this.getBaseUrl())
    const loginAvailable = this.account.state.get().loginAvailable
    this.patch({ privileged, loginAvailable })

    if (this.forced) {
      this.patch({ open: true })
      return
    }
    if (transport === undefined) {
      this.patch({ open: false })
      return
    }
    if (this.providers.state.get().status !== 'ready' && this.providers.state.get().status !== 'error') {
      return
    }
    if (this.providers.state.get().canRun) {
      this.patch({ open: false })
      return
    }
    if (this.skipped) {
      this.patch({ open: false })
      return
    }
    const skipped = await this.readSkipped(transport)
    if (skipped) {
      this.skipped = true
      this.patch({ open: false })
      return
    }
    if (!privileged && !loginAvailable) {
      this.patch({ open: false })
      return
    }
    this.patch({ open: true, pane: this.state.get().open ? this.state.get().pane : 'fork' })
  }

  private async readSkipped(transport: HarnessTransport): Promise<boolean> {
    const described = await transport.call('settings.describe', {})
    if (!described.ok) return false
    const view = described.value.namespaces.find(item => item.ns === ONBOARDING_NS)
    if (view === undefined) return false
    const value = view.value
    if (typeof value !== 'object' || value === null) return false
    return (value as { setupVersion?: unknown }).setupVersion === SETUP_VERSION
  }

  private async writeSetupVersion(): Promise<void> {
    const transport = this.getTransport()
    if (transport === undefined) return
    const described = await transport.call('settings.describe', {})
    const revision = described.ok
      ? described.value.namespaces.find(item => item.ns === ONBOARDING_NS)?.revision
      : undefined
    const result = await transport.call('settings.mutate', {
      ns: ONBOARDING_NS,
      expectedRevision: revision,
      ops: [{ op: 'set', path: ['setupVersion'], value: SETUP_VERSION }],
    })
    if (!result.ok) {
      this.patch({ error: '无法记下跳过。本机 settings 可能还没注册 ui-onboarding。' })
    }
  }

  private patch(partial: Partial<OnboardingSnapshot>): void {
    this.state.set({ ...this.state.get(), ...partial })
  }
}
