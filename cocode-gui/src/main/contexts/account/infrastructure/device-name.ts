import { hostname } from "node:os"

const MAX_HOSTNAME_LENGTH = 80

/** Stable, device-oriented label shared by GUI and TUI on the same machine. */
export function deviceKeyName(currentHostname = hostname()): string {
	const safeHostname = currentHostname.trim().replace(/\s+/g, " ").slice(0, MAX_HOSTNAME_LENGTH)
	return safeHostname === "" ? "Cocode Device" : `Cocode Device — ${safeHostname}`
}

/**
 * Fallback lifetime for a device key. A key outlives the identity that minted it,
 * so a crash, a reimaged machine or a deleted config directory skips sign-out and
 * would otherwise leave the key valid forever. Sign-in validates and re-mints on
 * demand, and this is far longer than the thirty-day refresh token, so an active
 * user never reaches it.
 */
const KEY_TTL_DAYS = 90

/** Bounded expiry for a freshly minted device key, as RFC3339. */
export function deviceKeyExpiry(now = Date.now()): string {
	return new Date(now + KEY_TTL_DAYS * 86_400_000).toISOString()
}
