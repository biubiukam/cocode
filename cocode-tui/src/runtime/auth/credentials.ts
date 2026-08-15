/**
 * Harness credential document: REF: value mapping, nothing else.
 */

import { credentialsPath } from './paths.ts'
import { readYamlUnknown, writeYamlFile } from './io.ts'
import { TuiError } from '../errors/index.ts'

const REF = /^[A-Za-z_][A-Za-z0-9_]*$/

export async function readCredentials(home: string): Promise<Record<string, string>> {
  const loaded = await readYamlUnknown(credentialsPath(home), { secret: true })
  if (loaded.missing) return {}
  return asStringMap(loaded.value)
}

export async function patchCredential(
  home: string,
  ref: string,
  value: string | undefined,
): Promise<void> {
  if (!REF.test(ref)) throw new TuiError('AUTH_CREDENTIAL_REF', { ref })
  const path = credentialsPath(home)
  const loaded = await readYamlUnknown(path, { secret: true })
  const current = loaded.missing ? {} : asStringMap(loaded.value)
  if (value === undefined) {
    delete current[ref]
  } else {
    const trimmed = value.trim()
    if (trimmed === '') throw new TuiError('AUTH_CREDENTIAL_EMPTY')
    current[ref] = trimmed
  }
  await writeYamlFile(path, current, 0o600)
}

function asStringMap(value: unknown): Record<string, string> {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TuiError('AUTH_CREDENTIALS_PARSE')
  }
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string' || !REF.test(key) || item.trim() === '') {
      throw new TuiError('AUTH_CREDENTIALS_PARSE')
    }
    out[key] = item
  }
  return out
}
