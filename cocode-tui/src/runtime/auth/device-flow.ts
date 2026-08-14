/**
 * RFC 8628 device authorization against the Cocode agency.
 */

import { jsonRequest, problemCode, problemTitle } from './agency.ts'
import { normalizeAgencyOrigin, validateVerificationUrl } from './origin.ts'
import { DEVICE_SCOPES, KEY_NAME, type CloudModel, type MeProfile } from './types.ts'

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

export type AgencyClient = {
  fetch?: typeof fetch
  delay?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultDelay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export async function startDeviceAuthorization(
  origin: string,
  client: AgencyClient = {},
  signal?: AbortSignal,
): Promise<DeviceAuthorization> {
  const safeOrigin = normalizeAgencyOrigin(origin)
  const created = await jsonRequest<DeviceAuthorization>(
    `${safeOrigin}/v1/auth/device/authorizations`,
    {
      method: 'POST',
      body: {
        client_name: 'cocode',
        device_label: KEY_NAME,
        scopes: [...DEVICE_SCOPES],
      },
      fetch: client.fetch,
      signal,
    },
  )
  if (created.status !== 200 && created.status !== 201) {
    throw new Error(problemTitle(created.value, 'could not start device login'))
  }
  const value = created.value
  if (!isRecord(value)) {
    throw new Error('agency returned an invalid device authorization')
  }
  if (
    !isNonempty(value.device_code) ||
    !isNonempty(value.user_code) ||
    !isPositiveFinite(value.expires_in) ||
    !isPositiveFinite(value.interval)
  ) {
    throw new Error('agency returned an invalid device authorization')
  }
  const verificationUri = validateVerificationUrl(value.verification_uri, 'verification_uri')
  const verificationUriComplete = validateVerificationUrl(
    value.verification_uri_complete,
    'verification_uri_complete',
  )
  return {
    ...value,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
  }
}

export async function pollDeviceToken(
  origin: string,
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
  signal: AbortSignal,
  client: AgencyClient = {},
): Promise<TokenPair> {
  const delay = client.delay ?? defaultDelay
  const now = client.now ?? Date.now
  const deadline = now() + expiresInSec * 1000
  let waitSec = Math.max(1, intervalSec)
  for (;;) {
    if (signal.aborted) throw new Error('login cancelled')
    const remaining = deadline - now()
    if (remaining <= 0) throw new Error('device authorization expired')
    await delay(Math.min(waitSec * 1000, remaining))
    if (signal.aborted) throw new Error('login cancelled')
    if (deadline - now() <= 0) throw new Error('device authorization expired')
    const polled = await jsonRequest<TokenPair>(
      `${normalizeAgencyOrigin(origin)}/v1/auth/device/token`,
      {
        method: 'POST',
        body: { device_code: deviceCode },
        fetch: client.fetch,
        signal,
      },
    )
    if (polled.status === 200 && isTokenPair(polled.value)) {
      return polled.value
    }
    const code = problemCode(polled.value)
    if (code === 'authorization_pending') continue
    if (code === 'slow_down') {
      waitSec += 5
      continue
    }
    throw new Error(problemTitle(polled.value, 'device login was not approved'))
  }
}

export async function loadProfile(
  origin: string,
  accessToken: string,
  client: AgencyClient = {},
  signal?: AbortSignal,
): Promise<MeProfile> {
  const me = await jsonRequest<{
    user?: { display_name?: string; email?: string }
  }>(`${normalizeAgencyOrigin(origin)}/v1/me`, {
    method: 'GET',
    token: accessToken,
    fetch: client.fetch,
    signal,
  })
  if (me.status !== 200) {
    throw new Error(problemTitle(me.value, 'could not load account'))
  }
  if (!isRecord(me.value)) {
    throw new Error('agency returned an invalid account')
  }
  const user = me.value.user
  if (user !== undefined && (typeof user !== 'object' || user === null)) {
    throw new Error('agency returned an invalid account')
  }
  const displayName = typeof user?.display_name === 'string' ? user.display_name.trim() : ''
  const email = typeof user?.email === 'string' ? user.email : undefined
  return {
    displayName: displayName === '' ? email ?? 'Cocode' : displayName,
    ...(email === undefined ? {} : { email }),
  }
}

export async function mintPersonalKey(
  origin: string,
  accessToken: string,
  client: AgencyClient = {},
  signal?: AbortSignal,
): Promise<{ secret: string; id: string }> {
  const created = await jsonRequest<{ secret?: string; id?: string }>(
    `${normalizeAgencyOrigin(origin)}/v1/me/api-keys`,
    {
      method: 'POST',
      token: accessToken,
      body: { name: KEY_NAME, scopes: ['models:read', 'inference:write'] },
      fetch: client.fetch,
      signal,
    },
  )
  if (
    !isRecord(created.value) ||
    (created.status !== 201 && created.status !== 200) ||
    !isNonempty(created.value.secret) ||
    !isNonempty(created.value.id)
  ) {
    throw new Error(problemTitle(created.value, 'could not create an API key'))
  }
  return { secret: created.value.secret.trim(), id: created.value.id.trim() }
}

export async function listHostedModels(
  origin: string,
  apiKey: string,
  client: AgencyClient = {},
  signal?: AbortSignal,
): Promise<CloudModel[]> {
  const listed = await jsonRequest<{
    data?: { id?: string; name?: string }[]
  }>(`${normalizeAgencyOrigin(origin)}/v1/me/models`, {
    method: 'GET',
    token: apiKey,
    fetch: client.fetch,
    signal,
  })
  if (listed.status !== 200) {
    throw new Error(problemTitle(listed.value, 'could not list hosted models'))
  }
  if (!isRecord(listed.value)) {
    throw new Error('agency returned an invalid model catalog')
  }
  if (!Array.isArray(listed.value.data)) {
    throw new Error('agency returned an invalid model catalog')
  }
  return listed.value.data
    .filter(
      (row): row is { id: string; name?: string } =>
        isRecord(row) && typeof row.id === 'string' && row.id.trim() !== '',
    )
    .map((row) => ({
      id: row.id.trim(),
      name:
        typeof row.name !== 'string' || row.name.trim() === '' ? row.id.trim() : row.name.trim(),
    }))
}

export async function revokeToken(
  origin: string,
  refreshToken: string,
  client: AgencyClient = {},
  signal?: AbortSignal,
): Promise<void> {
  try {
    await jsonRequest(`${normalizeAgencyOrigin(origin)}/v1/auth/token/revoke`, {
      method: 'POST',
      body: { refresh_token: refreshToken },
      fetch: client.fetch,
      signal,
    })
  } catch {
    // Local sign-out still proceeds.
  }
}

export async function refreshAccess(
  origin: string,
  refreshToken: string,
  client: AgencyClient = {},
  signal?: AbortSignal,
): Promise<TokenPair> {
  const refreshed = await jsonRequest<TokenPair>(
    `${normalizeAgencyOrigin(origin)}/v1/auth/token/refresh`,
    {
      method: 'POST',
      body: { refresh_token: refreshToken },
      fetch: client.fetch,
      signal,
    },
  )
  if (refreshed.status !== 200 || !isTokenPair(refreshed.value)) {
    throw new Error('session expired')
  }
  return refreshed.value
}

function isNonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isTokenPair(value: unknown): value is TokenPair {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    isNonempty(record.access_token) &&
    isNonempty(record.refresh_token) &&
    isPositiveFinite(record.expires_in)
  )
}
