/**
 * Address-bar URL policy for the sidebar browser, shared by both halves: the
 * toolbar normalizes what the user typed, and the host re-validates every
 * navigation (including each redirect hop) before it reaches the page.
 *
 * Unlike the retired iframe previewer, loopback is ALLOWED here: previewing a
 * dev server the user just started is the single most common reason to open
 * this panel, and a real browser profile makes it no more dangerous than
 * opening the same URL in Chrome. What stays refused is any non-http(s)
 * scheme and the GUI's own origin — a page served by the DSH server has no
 * business being driven from inside the automation profile.
 *
 * Kept dependency-free and Node-free so both bundles can import it.
 */

/** Why one navigation attempt was refused. */
export type BrowserBlockReason = 'scheme' | 'self'

/** Result of normalizing one address-bar input. */
export type BrowserNavigateResult =
  | { kind: 'ok'; url: string }
  | { kind: 'blocked'; reason: BrowserBlockReason }
  | { kind: 'invalid' }

/**
 * Schemes that must never reach the page, even without `//`. Host:port
 * lookalikes (`example.com:8080`) are deliberately absent — they parse as
 * hosts below and get an https:// prefix.
 */
const FORBIDDEN_SCHEMES = new Set([
  'javascript', 'data', 'file', 'about', 'vbscript', 'blob',
  'mailto', 'tel', 'ftp', 'ftps', 'ws', 'wss', 'sftp', 'ssh',
  'chrome', 'chrome-extension', 'moz-extension', 'edge', 'opera',
  'resource', 'view-source', 'devtools',
])

/**
 * Normalize one address-bar input against the navigation policy.
 *
 * @param input - Raw user text or a URL reported by the page.
 * @param selfOrigin - The GUI server's own origin, refused so the automation
 * profile never drives the Cocode UI itself. Pass `undefined` when unknown
 * (the host derives it from the request Host header).
 */
export function normalizeBrowserUrl(input: string, selfOrigin?: string): BrowserNavigateResult {
  const trimmed = input.trim()
  if (trimmed === '') return { kind: 'invalid' }
  // Distinguish an explicit scheme from a bare host:port. "example.com:8080"
  // matches a naive scheme regex (dots are legal in schemes), so a scheme
  // prefix is only honored when it is http(s) or a known-forbidden scheme.
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)
  let withScheme: string
  if (schemeMatch === null) {
    withScheme = `https://${trimmed}`
  } else {
    const scheme = schemeMatch[1]!.toLowerCase()
    if (scheme === 'http' || scheme === 'https') withScheme = trimmed
    else if (FORBIDDEN_SCHEMES.has(scheme)) return { kind: 'blocked', reason: 'scheme' }
    else withScheme = `https://${trimmed}`
  }
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { kind: 'invalid' }
  }
  // Protocol backstop: anything that still parses to a non-http(s) scheme
  // (ftp://, ws:// — they carry `//` and skip the list above) is refused.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'blocked', reason: 'scheme' }
  }
  if (selfOrigin !== undefined && selfOrigin !== '') {
    try {
      if (url.origin === new URL(selfOrigin).origin) return { kind: 'blocked', reason: 'self' }
    } catch {
      // An unparsable selfOrigin cannot match; fall through and allow.
    }
  }
  return { kind: 'ok', url: url.href }
}
