/**
 * TUI identity session. Inference keys do not live here.
 */

import { unlink } from 'node:fs/promises'
import type { AccountRecord } from './types.ts'
import { accountPath } from './paths.ts'
import { readYamlUnknown, writeYamlFile } from './io.ts'
import { normalizeAgencyOrigin } from './origin.ts'

export async function readAccount(home: string): Promise<AccountRecord | undefined> {
  const loaded = await readYamlUnknown(accountPath(home), { secret: true })
  if (loaded.missing || !isRecord(loaded.value)) return undefined
  const origin = asString(loaded.value.origin)
  if (origin === undefined) return undefined
  const safeOrigin = normalizeAgencyOrigin(origin)
  const accessToken = asString(loaded.value.access_token)
  const refreshToken = asString(loaded.value.refresh_token)
  const accessExpiresAt = asNumber(loaded.value.access_expires_at)
  if (accessToken === undefined || refreshToken === undefined || accessExpiresAt === undefined) {
    return undefined
  }
  const personalKeyId = asString(loaded.value.personal_key_id)
  const personalKeyName = asString(loaded.value.personal_key_name)
  return {
    origin: safeOrigin,
    accessToken,
    refreshToken,
    accessExpiresAt,
    ...(personalKeyId === undefined ? {} : { personalKeyId }),
    ...(personalKeyName === undefined ? {} : { personalKeyName }),
  }
}

export async function writeAccount(home: string, record: AccountRecord): Promise<void> {
  const origin = normalizeAgencyOrigin(record.origin)
  const existing = await readYamlUnknown(accountPath(home), { secret: true })
  const preserved = !existing.missing && isRecord(existing.value) ? existing.value : {}
  await writeYamlFile(
    accountPath(home),
    {
      ...preserved,
      origin,
      access_token: record.accessToken,
      refresh_token: record.refreshToken,
      access_expires_at: record.accessExpiresAt,
      ...(record.personalKeyId === undefined ? {} : { personal_key_id: record.personalKeyId }),
      ...(record.personalKeyName === undefined
        ? {}
        : { personal_key_name: record.personalKeyName }),
    },
    0o600,
  )
}

export async function deleteAccount(home: string): Promise<void> {
  try {
    await unlink(accountPath(home))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
