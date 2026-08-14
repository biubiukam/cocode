/**
 * Resolve the agency origin. Only https, plus local http in development.
 */

import { DEFAULT_ORIGIN } from './types.ts'

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
    throw new Error('agency origin is not a URL')
  }
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('agency origin must not contain credentials or query parameters')
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('agency origin must not contain a path')
  }
  const local =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1' ||
    parsed.hostname === '[::1]'
  if (parsed.protocol === 'https:') return parsed.origin
  if (parsed.protocol === 'http:' && local) return parsed.origin
  throw new Error('agency origin must be https')
}

export function validateVerificationUrl(value: string, field: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${field} is not a URL`)
  }
  const local =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1' ||
    parsed.hostname === '[::1]'
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(`${field} must not contain credentials`)
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error(`${field} must use https`)
  }
  return parsed.toString()
}
