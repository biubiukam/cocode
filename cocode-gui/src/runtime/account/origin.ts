/**
 * Agency origin for browser device-flow. Desktop native auth reads the same
 * name from the main-process environment.
 */

const DEFAULT_ORIGIN = 'https://cocode.agency'

export function agencyOrigin(): string {
  const configured = import.meta.env.VITE_COCODE_AGENCY_ORIGIN
  if (typeof configured === 'string' && configured !== '') return configured.replace(/\/$/, '')
  return DEFAULT_ORIGIN
}
