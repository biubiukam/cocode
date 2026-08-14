/**
 * AuthGate state machine. Tokens never appear on the snapshot.
 */

import { deleteAccount, readAccount, writeAccount } from './account.ts'
import { patchCredential, readCredentials } from './credentials.ts'
import {
  listHostedModels,
  loadProfile,
  mintPersonalKey,
  pollDeviceToken,
  refreshAccess,
  revokeToken,
  startDeviceAuthorization,
  type AgencyClient,
} from './device-flow.ts'
import { openExternal } from './open-url.ts'
import {
  defaultLiveContext,
  HomeBusyError,
  otherLiveCount,
  type LiveInstanceContext,
} from './live-instances.ts'
import { displayError, formatError, TuiError } from '../errors/index.ts'
import { agencyOrigin } from './origin.ts'
import { defaultHomeContext, productHome } from './paths.ts'
import { apiKeyEnvFor, channelAvailability, resolveAuth, saveByokKey } from './resolve.ts'
import {
  captureCloudSettings,
  patchAgentDefaultModel,
  patchCloudRoute,
  restoreCloudSettings,
  unsetCloudRoute,
  readSettings,
} from './settings.ts'
import {
  CLOUD_KEY_REF,
  CLOUD_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEEPSEEK_KEY_REF,
  KEY_NAME,
  type AccountRecord,
  type AuthAction,
  type AuthMode,
  type AuthSnapshot,
  type MeProfile,
  type ResolvedAuth,
} from './types.ts'

export type SelectModeResult =
  | { status: 'ready' }
  | { status: 'need-byok' }
  | { status: 'need-login' }
  | { status: 'env-locked' }
  | { status: 'home-busy' }

export type AuthStore = {
  snapshot(): AuthSnapshot
  subscribe(listener: () => void): () => void
  dispatch(action: AuthAction): void
  resolved(): ResolvedAuth
  waitUntilReady(): Promise<ResolvedAuth>
  selectMode(mode: AuthMode): Promise<SelectModeResult>
  logout(): Promise<void>
}

export type AuthStoreOptions = {
  home?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  client?: AgencyClient
  openUrl?: (url: string) => void
  live?: LiveInstanceContext
}

export async function createAuthStore(options: AuthStoreOptions = {}): Promise<AuthStore> {
  const env = options.env ?? process.env
  const home = options.home ?? productHome(defaultHomeContext(env))
  const store = new AuthStoreImpl(
    home,
    env,
    options.cwd,
    options.client,
    options.openUrl,
    options.live ?? defaultLiveContext,
  )
  await store.hydrate()
  return store
}

class AuthStoreImpl implements AuthStore {
  private snap: AuthSnapshot = {
    phase: 'gate',
    envLocked: false,
  }
  private auth: ResolvedAuth | undefined
  private readonly listeners = new Set<() => void>()
  private poll: AbortController | undefined
  private operationId = 0
  private refreshInFlight: Promise<void> | undefined
  private readyWaiters: Array<(auth: ResolvedAuth) => void> = []
  private profile: MeProfile | undefined

  constructor(
    private readonly home: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly cwd: string | undefined,
    private readonly client: AgencyClient | undefined,
    private readonly openUrl: ((url: string) => void) | undefined,
    private readonly live: LiveInstanceContext,
  ) {}

  private async homeIsBusy(): Promise<boolean> {
    return (await otherLiveCount(this.home, this.live)) > 0
  }

  async hydrate(signal?: AbortSignal): Promise<void> {
    try {
      await this.refreshCloudAccount(signal)
      if (signal?.aborted) return
      const resolved = await resolveAuth({
        home: this.home,
        env: this.env,
        cwd: this.cwd,
      })
      if (signal?.aborted) return
      if (resolved.status === 'ready') {
        this.auth = resolved.auth
        const credentials = await readCredentials(this.home)
        const settings = await readSettings(this.home)
        this.snap = {
          phase: 'ready',
          mode: resolved.auth.mode,
          envLocked: this.envLocked(resolved.auth.mode),
          channels: channelAvailability(credentials, settings, this.env),
          ...(this.profile === undefined ? {} : { profile: this.profile }),
        }
        this.flushReady()
        return
      }
      this.auth = undefined
      this.snap = { phase: 'gate', envLocked: resolved.envLocked }
    } catch (error) {
      if (signal?.aborted) return
      this.auth = undefined
      this.snap = {
        phase: 'failed',
        envLocked: false,
        error: displayError(error),
      }
    }
  }

  snapshot(): AuthSnapshot {
    return this.snap
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispatch(action: AuthAction): void {
    if (action.type === 'chooseByok') {
      this.beginOperation()
      this.snap = { phase: 'byok', envLocked: false }
      this.emit()
      return
    }
    if (action.type === 'submitByok') {
      void this.submitByok(action.key, this.beginOperation())
      return
    }
    if (action.type === 'chooseCocode') {
      void this.signInDevice(this.beginOperation())
      return
    }
    if (action.type === 'cancel') {
      this.beginOperation()
      this.poll = undefined
      this.snap = { phase: 'gate', envLocked: false }
      this.emit()
      return
    }
    if (action.type === 'logout') {
      void this.logout()
    }
  }

  resolved(): ResolvedAuth {
    if (this.auth === undefined) throw new TuiError('AUTH_NOT_READY')
    return this.auth
  }

  waitUntilReady(): Promise<ResolvedAuth> {
    if (this.auth !== undefined) return Promise.resolve(this.auth)
    return new Promise((resolve) => {
      this.readyWaiters.push(resolve)
    })
  }

  async selectMode(mode: AuthMode): Promise<SelectModeResult> {
    if (nonempty(this.env.COCODE_PROVIDER) !== undefined) {
      return { status: 'env-locked' }
    }
    if (await this.homeIsBusy()) return { status: 'home-busy' }
    const settings = await readSettings(this.home)
    const credentials = await readCredentials(this.home)
    if (mode === 'byok') {
      const has =
        nonempty(this.env[DEEPSEEK_KEY_REF]) !== undefined ||
        nonempty(credentials[DEEPSEEK_KEY_REF]) !== undefined
      if (!has) return { status: 'need-byok' }
      await patchAgentDefaultModel(this.home, DEFAULT_PROVIDER, DEFAULT_MODEL)
    } else {
      const has =
        (nonempty(this.env[CLOUD_KEY_REF]) !== undefined ||
          nonempty(credentials[CLOUD_KEY_REF]) !== undefined) &&
        settings.hasCloudRoute
      if (!has) return { status: 'need-login' }
      await patchAgentDefaultModel(this.home, CLOUD_PROVIDER, settings.cloudModel ?? settings.model)
    }
    await this.hydrate()
    return { status: 'ready' }
  }

  async logout(): Promise<void> {
    if (await this.homeIsBusy()) throw new HomeBusyError()
    const operation = this.beginOperation()
    let firstError: unknown
    let account: AccountRecord | undefined
    try {
      account = await readAccount(this.home)
    } catch (error) {
      firstError = error
    }
    if (account !== undefined) {
      await revokeToken(account.origin, account.refreshToken, this.client, operation.signal)
    }
    for (const cleanup of [
      () => deleteAccount(this.home),
      () => patchCredential(this.home, CLOUD_KEY_REF, undefined),
      () => unsetCloudRoute(this.home),
    ]) {
      try {
        await cleanup()
      } catch (error) {
        firstError ??= error
      }
    }
    this.profile = undefined
    await this.hydrate()
    this.emit()
    if (firstError !== undefined) throw firstError
  }

  private envLocked(mode: 'byok' | 'cocode'): boolean {
    const ref = mode === 'cocode' ? CLOUD_KEY_REF : apiKeyEnvFor(this.auth?.provider ?? '')
    if (ref === undefined) return false
    const value = this.env[ref]?.trim()
    return value !== undefined && value !== ''
  }

  private async submitByok(key: string, operation: Operation): Promise<void> {
    const trimmed = key.trim()
    if (trimmed === '') {
      this.snap = {
        phase: 'byok',
        envLocked: false,
        error: formatError('AUTH_BYOK_EMPTY'),
      }
      this.emit()
      return
    }
    this.snap = { phase: 'busy', envLocked: false }
    this.emit()
    let previousKey: string | undefined
    let didWrite = false
    try {
      this.ensureCurrent(operation)
      previousKey = (await readCredentials(this.home)).DEEPSEEK_API_KEY
      this.ensureCurrent(operation)
      await saveByokKey(this.home, trimmed)
      didWrite = true
      this.ensureCurrent(operation)
      await this.hydrate(operation.signal)
      this.ensureCurrent(operation)
      this.emit()
    } catch (error) {
      if (this.isCancelled(error, operation)) {
        if (didWrite) {
          await patchCredential(this.home, 'DEEPSEEK_API_KEY', previousKey).catch(() => undefined)
        }
        return
      }
      this.snap = {
        phase: 'failed',
        envLocked: false,
        error: displayError(error),
      }
      this.emit()
    }
  }

  private async signInDevice(operation: Operation): Promise<void> {
    if (await this.homeIsBusy()) {
      this.snap = {
        phase: 'failed',
        envLocked: false,
        error: formatError('AUTH_HOME_BUSY'),
      }
      this.emit()
      return
    }
    const poll = operation.controller
    this.poll = poll
    this.snap = { phase: 'busy', envLocked: false }
    this.emit()
    try {
      const origin = agencyOrigin(this.env)
      const authorization = await startDeviceAuthorization(origin, this.client, poll.signal)
      this.ensureCurrent(operation)
      this.snap = {
        phase: 'device',
        envLocked: false,
        device: {
          userCode: authorization.user_code,
          verificationUri: authorization.verification_uri,
          verificationUriComplete: authorization.verification_uri_complete,
          expiresIn: authorization.expires_in,
        },
      }
      this.emit()
      ;(this.openUrl ?? openExternal)(authorization.verification_uri_complete)
      const token = await pollDeviceToken(
        origin,
        authorization.device_code,
        authorization.interval,
        authorization.expires_in,
        poll.signal,
        this.client,
      )
      this.ensureCurrent(operation)
      let account: AccountRecord = {
        origin,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessExpiresAt: Date.now() + token.expires_in * 1000,
      }
      const profile = await loadProfile(origin, account.accessToken, this.client, poll.signal)
      this.ensureCurrent(operation)
      const existing = await readAccount(this.home)
      const credentials = await readCredentials(this.home)
      const reusable =
        existing?.personalKeyId !== undefined &&
        credentials[CLOUD_KEY_REF]?.trim() !== undefined &&
        credentials[CLOUD_KEY_REF]?.trim() !== ''
      let secret = credentials[CLOUD_KEY_REF]?.trim()
      if (!reusable || secret === undefined) {
        const minted = await mintPersonalKey(origin, account.accessToken, this.client, poll.signal)
        this.ensureCurrent(operation)
        secret = minted.secret
        account = {
          ...account,
          personalKeyId: minted.id,
          personalKeyName: KEY_NAME,
        }
      } else {
        account = {
          ...account,
          personalKeyId: existing.personalKeyId,
          personalKeyName: existing.personalKeyName ?? KEY_NAME,
        }
      }
      const models = await listHostedModels(origin, secret, this.client, poll.signal)
      this.ensureCurrent(operation)
      if (models.length === 0) {
        throw new TuiError('AUTH_NO_HOSTED_MODELS')
      }
      const settingsBackup = await captureCloudSettings(this.home)
      const previousCloudKey = credentials[CLOUD_KEY_REF]
      try {
        this.ensureCurrent(operation)
        if (!reusable && secret !== undefined) {
          await patchCredential(this.home, CLOUD_KEY_REF, secret)
        }
        this.ensureCurrent(operation)
        await patchCloudRoute(this.home, origin, models)
        this.ensureCurrent(operation)
        await writeAccount(this.home, account)
      } catch (error) {
        await this.restoreLoginState(existing, previousCloudKey, settingsBackup)
        throw error
      }
      this.ensureCurrent(operation)
      this.profile = profile
      await this.hydrate(operation.signal)
      this.ensureCurrent(operation)
      if (this.snap.phase === 'ready') {
        this.snap = { ...this.snap, profile: this.profile }
      }
      this.emit()
    } catch (error) {
      if (this.isCancelled(error, operation)) {
        return
      }
      if (poll.signal.aborted) {
        this.snap = { phase: 'gate', envLocked: false }
        this.emit()
        return
      }
      this.snap = {
        phase: 'failed',
        envLocked: false,
        error: displayError(error),
      }
      this.emit()
    }
  }

  private flushReady(): void {
    if (this.auth === undefined) return
    const waiters = this.readyWaiters
    this.readyWaiters = []
    for (const waiter of waiters) waiter(this.auth)
  }

  private beginOperation(): Operation {
    this.poll?.abort()
    const controller = new AbortController()
    this.poll = controller
    this.operationId += 1
    return { id: this.operationId, controller, signal: controller.signal }
  }

  private ensureCurrent(operation: Operation): void {
    if (operation.id !== this.operationId || operation.signal.aborted) {
      throw new AuthCancelledError()
    }
  }

  private isCancelled(error: unknown, operation: Operation): boolean {
    return (
      error instanceof AuthCancelledError ||
      operation.id !== this.operationId ||
      operation.signal.aborted
    )
  }

  private async restoreLoginState(
    account: AccountRecord | undefined,
    cloudKey: string | undefined,
    settingsBackup: Awaited<ReturnType<typeof captureCloudSettings>>,
  ): Promise<void> {
    await Promise.allSettled([
      account === undefined ? deleteAccount(this.home) : writeAccount(this.home, account),
      cloudKey === undefined
        ? patchCredential(this.home, CLOUD_KEY_REF, undefined)
        : patchCredential(this.home, CLOUD_KEY_REF, cloudKey),
      restoreCloudSettings(this.home, settingsBackup),
    ])
  }

  private async refreshCloudAccount(signal?: AbortSignal): Promise<void> {
    if (this.refreshInFlight !== undefined) {
      await this.refreshInFlight
      return
    }
    const refresh = this.doRefreshCloudAccount(signal)
    this.refreshInFlight = refresh
    try {
      await refresh
    } finally {
      if (this.refreshInFlight === refresh) this.refreshInFlight = undefined
    }
  }

  private async doRefreshCloudAccount(signal?: AbortSignal): Promise<void> {
    const account = await readAccount(this.home)
    if (account === undefined || account.accessExpiresAt > Date.now() + 30_000) return
    const credentials = await readCredentials(this.home)
    if (nonempty(credentials[CLOUD_KEY_REF]) === undefined) return
    try {
      const refreshed = await refreshAccess(
        account.origin,
        account.refreshToken,
        this.client,
        signal,
      )
      if (signal?.aborted) return
      await writeAccount(this.home, {
        ...account,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        accessExpiresAt: Date.now() + refreshed.expires_in * 1000,
      })
    } catch (error) {
      if (signal?.aborted) return
      await this.clearCloudState()
      if (error instanceof AuthCancelledError) throw error
    }
  }

  private async clearCloudState(): Promise<void> {
    const errors: unknown[] = []
    for (const cleanup of [
      () => deleteAccount(this.home),
      () => patchCredential(this.home, CLOUD_KEY_REF, undefined),
      () => unsetCloudRoute(this.home),
    ]) {
      try {
        await cleanup()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors[0] !== undefined) throw errors[0]
  }

  private emit(): void {
    if (this.snap.phase === 'ready') this.flushReady()
    for (const listener of this.listeners) listener()
  }
}

type Operation = {
  id: number
  controller: AbortController
  signal: AbortSignal
}

class AuthCancelledError extends Error {
  constructor() {
    super('login cancelled')
    this.name = 'AuthCancelledError'
  }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}
