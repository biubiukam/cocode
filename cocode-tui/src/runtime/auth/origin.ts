/**
 * Resolve the agency origin. Only https, plus local http in development.
 */

import { DEFAULT_ORIGIN } from './types.ts'
import { TuiError } from '../errors/index.ts'

export function agencyOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COCODE_AGENCY_ORIGIN?.trim()
  const origin = configured === undefined || configured === '' ? DEFAULT_ORIGIN : configured
  return normalizeAgencyOrigin(origin)
}

export function normalizeAgencyOrigin(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TuiError('AUTH_ORIGIN_INVALID')
  }
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new TuiError('AUTH_ORIGIN_CREDENTIALS')
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new TuiError('AUTH_ORIGIN_PATH')
  }
  const local =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1' ||
    parsed.hostname === '[::1]'
  if (parsed.protocol === 'https:') return parsed.origin
  if (parsed.protocol === 'http:' && local) return parsed.origin
  throw new TuiError('AUTH_ORIGIN_HTTPS')
}

export function validateVerificationUrl(value: string, field: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new TuiError('AUTH_VERIFY_URL_INVALID', { field })
  }
  const local =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1' ||
    parsed.hostname === '[::1]'
  if (parsed.username !== '' || parsed.password !== '') {
    throw new TuiError('AUTH_VERIFY_URL_CREDENTIALS', { field })
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new TuiError('AUTH_VERIFY_URL_HTTPS', { field })
  }
  return parsed.toString()
}
