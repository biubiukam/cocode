/**
 * Desktop native PKCE for Cocode agency identity.
 *
 * The main process owns the loopback callback, token file, and refresh. The
 * renderer only sees an account snapshot and a one-shot cloud provision blob.
 */

import { app, safeStorage, shell } from 'electron'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { AccountProfile, CloudProvision } from '../src/host/account.ts'

const CLIENT_ID = 'cocode-desktop'
const KEY_NAME = 'Cocode Desktop'
const SCOPES = [
  'profile:read',
  'organizations:read',
  'account:read',
  'models:read',
  'inference:write',
] as const
const DEFAULT_ORIGIN = 'https://cocode.agency'

type StoredSecret = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  personalKey?: string
  origin: string
}

type TokenPair = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

type MeSnapshot = {
  user?: { display_name?: string; email?: string }
}

function agencyOrigin(): string {
  const configured = process.env.COCODE_AGENCY_ORIGIN
  if (typeof configured === 'string' && configured !== '') return configured.replace(/\/$/, '')
  return DEFAULT_ORIGIN
}

function secretPath(): string {
  return join(app.getPath('userData'), 'account.bin')
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

async function jsonRequest<T>(
  url: string,
  init: { method: string; body?: unknown; token?: string },
): Promise<{ status: number; value: T }> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`
  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await response.text()
  let value: T
  try {
    value = text === '' ? ({} as T) : JSON.parse(text) as T
  }
  catch {
    throw new Error(`agency answered HTTP ${String(response.status)}`)
  }
  return { status: response.status, value }
}

function listenCallback(redirectPath: string): Promise<{
  url: string
  wait: () => Promise<URL>
  close: () => void
}> {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer()
    const pending = new Promise<URL>((resolveWait, rejectWait) => {
      const timer = setTimeout(() => {
        rejectWait(new Error('login timed out'))
        server.close()
      }, 600_000)
      server.on('request', (request: IncomingMessage, response: ServerResponse) => {
        const host = request.headers.host ?? '127.0.0.1'
        const arrived = new URL(request.url ?? '/', `http://${host}`)
        if (arrived.pathname !== redirectPath) {
          response.writeHead(404)
          response.end()
          return
        }
        clearTimeout(timer)
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end('<!doctype html><meta charset="utf-8"><title>Cocode</title><p>可以回到 Cocode 了。</p>')
        resolveWait(arrived)
        server.close()
      })
    })
    server.on('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        rejectListen(new Error('could not bind loopback callback'))
        return
      }
      resolveListen({
        url: `http://127.0.0.1:${String(address.port)}${redirectPath}`,
        wait: () => pending,
        close: () => { server.close() },
      })
    })
  })
}

export class AccountAuth {
  private secret: StoredSecret | undefined
  private profile: AccountProfile | null = null
  private readonly listeners = new Set<(profile: AccountProfile | null) => void>()
  private loaded = false
  private refreshTask: Promise<void> | undefined

  onChange(listener: (profile: AccountProfile | null) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener(this.profile)
  }

  async snapshot(): Promise<AccountProfile | null> {
    await this.ensureLoaded()
    if (this.secret === undefined) return null
    try {
      await this.ensureAccess()
      await this.refreshProfile()
    }
    catch {
      await this.clear()
    }
    return this.profile
  }

  async cloudProvision(): Promise<CloudProvision | null> {
    await this.ensureLoaded()
    if (this.secret === undefined) return null
    await this.ensureAccess()
    await this.ensurePersonalKey()
    if (this.secret.personalKey === undefined) return null
    const models = await this.listModels(this.secret.personalKey)
    return { origin: this.secret.origin, apiKey: this.secret.personalKey, models }
  }

  async signIn(): Promise<void> {
    await this.ensureLoaded()
    if (this.secret !== undefined) {
      await this.ensureAccess()
      await this.ensurePersonalKey()
      await this.refreshProfile()
      await this.persist()
      this.emit()
      return
    }
    const origin = agencyOrigin()
    const callback = await listenCallback('/auth/callback')
    const { verifier, challenge } = pkce()
    const state = base64Url(randomBytes(24))
    try {
      const created = await jsonRequest<{ authorization_url?: string }>(
        `${origin}/v1/auth/native/authorizations`,
        {
          method: 'POST',
          body: {
            client_id: CLIENT_ID,
            device_label: 'Cocode Desktop',
            redirect_uri: callback.url,
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            scopes: [...SCOPES],
          },
        },
      )
      if (created.status !== 201 || typeof created.value.authorization_url !== 'string') {
        throw new Error('could not start Cocode login')
      }
      await shell.openExternal(created.value.authorization_url)
      const arrived = await callback.wait()
      if (arrived.searchParams.get('state') !== state) throw new Error('login state mismatch')
      const code = arrived.searchParams.get('code')
      if (code === null || code === '') throw new Error('login was not approved')
      const exchanged = await jsonRequest<TokenPair>(`${origin}/v1/auth/native/token`, {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code,
          redirect_uri: callback.url,
          code_verifier: verifier,
        },
      })
      if (exchanged.status !== 200 || exchanged.value.access_token === undefined) {
        throw new Error('could not exchange login code')
      }
      this.secret = {
        accessToken: exchanged.value.access_token,
        refreshToken: exchanged.value.refresh_token,
        accessExpiresAt: Date.now() + exchanged.value.expires_in * 1000,
        origin,
      }
      await this.ensureAccess()
      await this.ensurePersonalKey()
      await this.refreshProfile()
      await this.persist()
      this.emit()
    }
    finally {
      callback.close()
    }
  }

  async signOut(): Promise<void> {
    await this.ensureLoaded()
    const current = this.secret
    if (current !== undefined) {
      try {
        await jsonRequest(`${current.origin}/v1/auth/token/revoke`, {
          method: 'POST',
          body: { token: current.refreshToken },
        })
      }
      catch {
        // Local sign-out still proceeds; a dead refresh token is already unusable.
      }
    }
    await this.clear()
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const bytes = await readFile(secretPath())
      if (!safeStorage.isEncryptionAvailable()) return
      const parsed = JSON.parse(safeStorage.decryptString(bytes)) as StoredSecret
      if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') return
      this.secret = parsed
    }
    catch {
      this.secret = undefined
    }
  }

  private async persist(): Promise<void> {
    if (this.secret === undefined || !safeStorage.isEncryptionAvailable()) return
    const payload = safeStorage.encryptString(JSON.stringify(this.secret))
    await writeFile(secretPath(), payload, { mode: 0o600 })
  }

  private async clear(): Promise<void> {
    this.secret = undefined
    this.profile = null
    try {
      await unlink(secretPath())
    }
    catch {
      // Missing file is the desired end state.
    }
    this.emit()
  }

  private async ensureAccess(): Promise<void> {
    const current = this.secret
    if (current === undefined) throw new Error('not signed in')
    if (Date.now() < current.accessExpiresAt - 30_000) return
    if (this.refreshTask !== undefined) {
      await this.refreshTask
      return
    }
    this.refreshTask = this.rotateAccess().finally(() => { this.refreshTask = undefined })
    await this.refreshTask
  }

  private async rotateAccess(): Promise<void> {
    const current = this.secret
    if (current === undefined) throw new Error('not signed in')
    const refreshed = await jsonRequest<TokenPair>(`${current.origin}/v1/auth/token/refresh`, {
      method: 'POST',
      body: { refresh_token: current.refreshToken },
    })
    if (refreshed.status !== 200 || refreshed.value.access_token === undefined) {
      throw new Error('session expired')
    }
    current.accessToken = refreshed.value.access_token
    if (typeof refreshed.value.refresh_token === 'string' && refreshed.value.refresh_token !== '') {
      current.refreshToken = refreshed.value.refresh_token
    }
    current.accessExpiresAt = Date.now() + refreshed.value.expires_in * 1000
    await this.persist()
  }

  private async refreshProfile(): Promise<void> {
    const current = this.secret
    if (current === undefined) return
    const me = await jsonRequest<MeSnapshot>(`${current.origin}/v1/me`, {
      method: 'GET',
      token: current.accessToken,
    })
    if (me.status !== 200) throw new Error('could not load account')
    const displayName = me.value.user?.display_name?.trim() ?? ''
    const email = me.value.user?.email
    this.profile = {
      displayName: displayName === '' ? (email ?? 'Cocode') : displayName,
      ...email === undefined ? {} : { email },
    }
  }

  private async ensurePersonalKey(): Promise<void> {
    const current = this.secret
    if (current === undefined) return
    if (current.personalKey !== undefined) {
      try {
        await this.listModels(current.personalKey)
        return
      }
      catch {
        current.personalKey = undefined
      }
    }
    const created = await jsonRequest<{ secret?: string }>(`${current.origin}/v1/me/api-keys`, {
      method: 'POST',
      token: current.accessToken,
      body: { name: KEY_NAME, scopes: ['models:read', 'inference:write'] },
    })
    if (created.status !== 201 && created.status !== 200) throw new Error('could not create a desktop API key')
    if (typeof created.value.secret !== 'string' || created.value.secret === '') {
      throw new Error('desktop API key was not returned')
    }
    current.personalKey = created.value.secret
    await this.persist()
  }

  private async listModels(apiKey: string): Promise<{ id: string; name: string }[]> {
    const current = this.secret
    if (current === undefined) return []
    const listed = await jsonRequest<{ data?: { id?: string; name?: string }[] }>(
      `${current.origin}/v1/me/models`,
      { method: 'GET', token: apiKey },
    )
    if (listed.status !== 200) throw new Error('could not list hosted models')
    const rows = listed.value.data ?? []
    return rows
      .filter((row): row is { id: string; name?: string } => typeof row.id === 'string' && row.id !== '')
      .map(row => ({ id: row.id, name: row.name === undefined || row.name === '' ? row.id : row.name }))
  }
}
