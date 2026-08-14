/**
 * RFC 8628 device authorization for the browser carrier.
 *
 * Tokens stay in memory for this process. They are never written to
 * localStorage (onboarding RFC §6.4.2).
 */

import { agencyOrigin } from './origin.ts'

const SCOPES = [
  'profile:read',
  'organizations:read',
  'account:read',
  'models:read',
  'inference:write',
] as const
const KEY_NAME = 'Cocode Desktop'

export type DeviceAuthorization = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export type TokenPair = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export type SessionSecret = {
  origin: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  personalKey?: string
}

export type MeProfile = {
  displayName: string
  email?: string
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

export async function startDeviceAuthorization(): Promise<{ origin: string; authorization: DeviceAuthorization }> {
  const origin = agencyOrigin()
  const created = await jsonRequest<DeviceAuthorization>(`${origin}/v1/auth/device/authorizations`, {
    method: 'POST',
    body: { client_name: 'cocode', device_label: 'Cocode Browser', scopes: [...SCOPES] },
  })
  if (created.status !== 200 && created.status !== 201) throw new Error('could not start device login')
  return { origin, authorization: created.value }
}

export async function pollDeviceToken(
  origin: string,
  deviceCode: string,
  intervalSec: number,
  signal: AbortSignal,
): Promise<TokenPair> {
  let waitSec = Math.max(1, intervalSec)
  for (;;) {
    if (signal.aborted) throw new Error('login cancelled')
    await new Promise(resolve => setTimeout(resolve, waitSec * 1000))
    if (signal.aborted) throw new Error('login cancelled')
    const polled = await jsonRequest<TokenPair & { error?: string }>(`${origin}/v1/auth/device/token`, {
      method: 'POST',
      body: { device_code: deviceCode },
    })
    if (polled.status === 200 && typeof polled.value.access_token === 'string') return polled.value
    const error = polled.value.error
    if (error === 'authorization_pending') continue
    if (error === 'slow_down') {
      waitSec += 5
      continue
    }
    throw new Error('device login was not approved')
  }
}

export async function loadProfile(origin: string, accessToken: string): Promise<MeProfile> {
  const me = await jsonRequest<{ user?: { display_name?: string; email?: string } }>(`${origin}/v1/me`, {
    method: 'GET',
    token: accessToken,
  })
  if (me.status !== 200) throw new Error('could not load account')
  const displayName = me.value.user?.display_name?.trim() ?? ''
  const email = me.value.user?.email
  return {
    displayName: displayName === '' ? (email ?? 'Cocode') : displayName,
    ...email === undefined ? {} : { email },
  }
}

export async function mintPersonalKey(origin: string, accessToken: string): Promise<string> {
  const created = await jsonRequest<{ secret?: string }>(`${origin}/v1/me/api-keys`, {
    method: 'POST',
    token: accessToken,
    body: { name: KEY_NAME, scopes: ['models:read', 'inference:write'] },
  })
  if ((created.status !== 201 && created.status !== 200) || typeof created.value.secret !== 'string') {
    throw new Error('could not create a desktop API key')
  }
  return created.value.secret
}

export async function listHostedModels(
  origin: string,
  apiKey: string,
): Promise<{ id: string; name: string }[]> {
  const listed = await jsonRequest<{ data?: { id?: string; name?: string }[] }>(
    `${origin}/v1/me/models`,
    { method: 'GET', token: apiKey },
  )
  if (listed.status !== 200) throw new Error('could not list hosted models')
  return (listed.value.data ?? [])
    .filter((row): row is { id: string; name?: string } => typeof row.id === 'string' && row.id !== '')
    .map(row => ({ id: row.id, name: row.name === undefined || row.name === '' ? row.id : row.name }))
}

export async function revokeToken(origin: string, refreshToken: string): Promise<void> {
  try {
    await jsonRequest(`${origin}/v1/auth/token/revoke`, {
      method: 'POST',
      body: { token: refreshToken },
    })
  }
  catch {
    // Local sign-out still proceeds.
  }
}

export async function refreshAccess(secret: SessionSecret): Promise<void> {
  if (Date.now() < secret.accessExpiresAt - 30_000) return
  const refreshed = await jsonRequest<TokenPair>(`${secret.origin}/v1/auth/token/refresh`, {
    method: 'POST',
    body: { refresh_token: secret.refreshToken },
  })
  if (refreshed.status !== 200 || typeof refreshed.value.access_token !== 'string') {
    throw new Error('session expired')
  }
  secret.accessToken = refreshed.value.access_token
  if (typeof refreshed.value.refresh_token === 'string' && refreshed.value.refresh_token !== '') {
    secret.refreshToken = refreshed.value.refresh_token
  }
  secret.accessExpiresAt = Date.now() + refreshed.value.expires_in * 1000
}
