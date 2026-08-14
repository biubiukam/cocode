/**
 * Account snapshot for the sidebar and first-run overlay.
 *
 * Desktop: HostBridge.account owns tokens. Browser: device flow, memory only.
 */

import { Observable } from '../notifier.ts'
import {
  listHostedModels,
  loadProfile,
  mintPersonalKey,
  pollDeviceToken,
  refreshAccess,
  revokeToken,
  startDeviceAuthorization,
  type DeviceAuthorization,
  type SessionSecret,
} from './device-flow.ts'

export type AccountProfile = {
  displayName: string
  email?: string
  avatarUrl?: string
}

export type CloudProvision = {
  origin: string
  apiKey: string
  models: { id: string; name: string }[]
}

/** Duck-typed native account API; the HostBridge supplies this on Electron. */
export type NativeAccountApi = {
  snapshot(): Promise<AccountProfile | null>
  signIn(): Promise<void>
  signOut(): Promise<void>
  onChange(listener: (profile: AccountProfile | null) => void): () => void
  cloudProvision(): Promise<CloudProvision | null>
}

export type AccountSnapshot = {
  profile: AccountProfile | null
  signingIn: boolean
  device: DeviceAuthorization | null
  error?: string
  loginAvailable: boolean
}

function emptySnapshot(loginAvailable: boolean): AccountSnapshot {
  return { profile: null, signingIn: false, device: null, loginAvailable }
}

export class AccountStore {
  readonly state: Observable<AccountSnapshot>
  private session: SessionSecret | undefined
  private poll: AbortController | undefined

  constructor(
    platform: 'electron' | 'browser',
    private readonly native: NativeAccountApi | undefined,
  ) {
    this.state = new Observable(emptySnapshot(native !== undefined || platform === 'browser'))
    native?.onChange(profile => {
      this.state.set({ ...this.state.get(), profile, signingIn: false, device: null, error: undefined })
    })
    if (native !== undefined) void this.hydrateNative()
  }

  private async hydrateNative(): Promise<void> {
    const profile = await this.native?.snapshot() ?? null
    this.state.set({ ...this.state.get(), profile })
  }

  async signIn(): Promise<void> {
    if (this.state.get().profile !== null) return
    if (this.native !== undefined) {
      this.state.set({ ...this.state.get(), signingIn: true, error: undefined })
      try {
        await this.native.signIn()
        const profile = await this.native.snapshot()
        this.state.set({ ...this.state.get(), profile, signingIn: false })
      }
      catch (error) {
        this.state.set({
          ...this.state.get(),
          signingIn: false,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      return
    }
    if (this.session !== undefined) return
    await this.signInDevice()
  }

  cancelSignIn(): void {
    this.poll?.abort()
    this.poll = undefined
    if (this.state.get().signingIn || this.state.get().device !== null) {
      this.state.set({ ...this.state.get(), signingIn: false, device: null })
    }
  }

  async signOut(): Promise<void> {
    this.cancelSignIn()
    if (this.native !== undefined) {
      await this.native.signOut()
      this.state.set({ ...this.state.get(), profile: null, signingIn: false, device: null })
      return
    }
    if (this.session !== undefined) await revokeToken(this.session.origin, this.session.refreshToken)
    this.session = undefined
    this.state.set({ ...this.state.get(), profile: null, signingIn: false, device: null })
  }

  async cloudProvision(): Promise<CloudProvision | null> {
    if (this.native !== undefined) return this.native.cloudProvision()
    if (this.session === undefined) return null
    await refreshAccess(this.session)
    if (this.session.personalKey === undefined) {
      this.session.personalKey = await mintPersonalKey(this.session.origin, this.session.accessToken)
    }
    const models = await listHostedModels(this.session.origin, this.session.personalKey)
    return { origin: this.session.origin, apiKey: this.session.personalKey, models }
  }

  private async signInDevice(): Promise<void> {
    this.poll?.abort()
    const poll = new AbortController()
    this.poll = poll
    this.state.set({ ...this.state.get(), signingIn: true, error: undefined, device: null })
    try {
      const { origin, authorization } = await startDeviceAuthorization()
      this.state.set({ ...this.state.get(), device: authorization })
      const token = await pollDeviceToken(origin, authorization.device_code, authorization.interval, poll.signal)
      this.session = {
        origin,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessExpiresAt: Date.now() + token.expires_in * 1000,
      }
      const profile = await loadProfile(origin, this.session.accessToken)
      this.session.personalKey = await mintPersonalKey(origin, this.session.accessToken)
      this.state.set({ ...this.state.get(), profile, signingIn: false, device: null })
    }
    catch (error) {
      if (poll.signal.aborted) {
        this.state.set({ ...this.state.get(), signingIn: false, device: null })
        return
      }
      this.state.set({
        ...this.state.get(),
        signingIn: false,
        device: null,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    finally {
      if (this.poll === poll) this.poll = undefined
    }
  }
}
