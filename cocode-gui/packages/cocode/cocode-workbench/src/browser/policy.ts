/**
 * Navigation and trust policy. Every hop is re-checked, because a redirect is
 * exactly how an allowed URL turns into a forbidden one.
 */
import { BrowserError } from "./protocol.ts"

/** Origins the page must never reach: reaching them means same-origin access to our own API. */
export interface PolicyOptions {
  readonly blockedOrigins: readonly string[]
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed === "") throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", "An address is required.")
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try { parsed = new URL(candidate) } catch { throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", `${input} is not a valid address.`) }
  return parsed.href
}

/**
 * Reject anything that is not plain web content, plus our own origin. Loopback
 * stays allowed on purpose: previewing a local dev server is a primary use.
 */
export function assertNavigable(url: string, options: PolicyOptions): URL {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", `${url} is not a valid address.`) }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", `${parsed.protocol} addresses are not supported.`)
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", "Addresses with embedded credentials are not allowed.")
  }
  if (options.blockedOrigins.includes(parsed.origin)) {
    throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", "This address belongs to Cocode itself and cannot be opened in the browser.")
  }
  return parsed
}

/** Two-label suffixes where the registrable domain needs a third label. */
const COMPOUND_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "or.jp", "ne.jp",
  "com.cn", "net.cn", "org.cn", "gov.cn", "com.au", "net.au", "com.br", "com.hk", "com.tw", "co.kr",
])

/**
 * Approximate eTLD+1. Used to decide when an agent has wandered off the site
 * it started on, so an approximation that errs toward "different" is fine.
 */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean)
  if (labels.length <= 2) return labels.join(".")
  const lastTwo = labels.slice(-2).join(".")
  return COMPOUND_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo
}

/**
 * Sites where a single click can move money, change infrastructure or hand out
 * an identity. Interaction here is confirmed even when the action looks benign.
 */
const HIGH_RISK_DOMAINS = [
  "paypal.com", "stripe.com", "alipay.com", "checkout.com",
  "console.aws.amazon.com", "aws.amazon.com", "portal.azure.com", "console.cloud.google.com",
  "accounts.google.com", "login.microsoftonline.com", "okta.com", "auth0.com",
]

export function isHighRiskUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return HIGH_RISK_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))
  } catch { return false }
}

/** Text that must never leave the host as-is, whatever the page calls the field. */
const SECRET_HINTS = /(password|passwd|secret|token|api[-_ ]?key|authorization|credit|cvv|ssn)/i

export function looksSecret(label: string | undefined): boolean {
  return label !== undefined && SECRET_HINTS.test(label)
}

/** Long high-entropy strings are treated as credentials regardless of context. */
const TOKEN_LIKE = /\b(?:[A-Za-z0-9_-]{32,}|(?:sk|pk|ghp|gho|xox[bpsa])[-_][A-Za-z0-9]{16,})\b/g

export function redactSecrets(text: string): string {
  return text.replace(TOKEN_LIKE, "[redacted]")
}
