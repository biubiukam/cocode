/**
 * Navigation and side-effect policy the agent tools share.
 *
 * Humans type any http(s) URL they want. The model does not: a new
 * registrable domain, a high-risk host, or a side-effect action needs an
 * explicit `confirm: true` after the user has seen the request. That is
 * the whole trust model — page text is data, never permission.
 */

import { BROWSER_ERRORS, BrowserError } from './protocol.ts'

/** Multi-part public suffixes that would otherwise collapse to the TLD. */
const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.cn', 'net.cn', 'org.cn', 'com.au', 'com.br', 'co.jp', 'co.kr',
  'com.hk', 'com.tw', 'co.nz', 'com.sg',
])

/** Payment, cloud-console, and identity hosts the agent may not touch silently. */
const HIGH_RISK_SUFFIXES = [
  'paypal.com', 'stripe.com', 'alipay.com', 'alipayobjects.com',
  'checkout.com', 'square.com', 'adyen.com', 'braintreegateway.com',
  'amazon.com', 'aws.amazon.com', 'console.aws.amazon.com',
  'azure.com', 'portal.azure.com',
  'cloud.google.com', 'console.cloud.google.com',
  'accounts.google.com', 'login.microsoftonline.com',
  'okta.com', 'auth0.com', 'id.apple.com',
  'bankofamerica.com', 'chase.com', 'wellsfargo.com',
]

/** Button / link names that count as side-effects even as a plain click. */
const SIDE_EFFECT_NAME = /\b(submit|pay|purchase|buy|delete|remove|confirm|transfer|withdraw|checkout|place order|付款|支付|删除|确认提交)\b/i

/** Per-conversation browse scope: the first domain is free, later ones are not. */
export class BrowseScope {
  private readonly domains = new Set<string>()

  /** Remember a domain the user or a confirmed hop already opened. */
  allow(domain: string): void {
    this.domains.add(domain)
  }

  /** Whether this conversation has already visited the registrable domain. */
  knows(domain: string): boolean {
    return this.domains.has(domain)
  }

  /** Whether any domain has been recorded. */
  get empty(): boolean {
    return this.domains.size === 0
  }
}

/** Registrable domain of a hostname (eTLD+1, with a small multi-part TLD list). */
export function registrableDomain(hostname: string): string {
  const host = hostname.replace(/\.$/, '').toLowerCase()
  if (host === '' || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host
  const labels = host.split('.')
  if (labels.length < 2) return host
  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_PART_TLDS.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.')
  return lastTwo
}

/** Whether a host is a payment, cloud-console, or identity surface. */
export function isHighRiskHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return HIGH_RISK_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
}

/**
 * Gate one agent navigation. The first domain in a conversation is free;
 * a new eTLD or a high-risk host requires `confirm: true`.
 */
export function assertAgentNavigation(scope: BrowseScope, url: string, confirm: boolean): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new BrowserError(BROWSER_ERRORS.blocked, `"${url}" is not a usable address`)
  }
  const domain = registrableDomain(parsed.hostname)
  if (isHighRiskHost(parsed.hostname) && !confirm) {
    throw new BrowserError(
      BROWSER_ERRORS.confirmation,
      `opening ${parsed.hostname} needs the user's confirmation (payment, cloud console, or identity provider). Ask them, then retry with confirm=true.`,
    )
  }
  if (!scope.empty && !scope.knows(domain) && !confirm) {
    throw new BrowserError(
      BROWSER_ERRORS.confirmation,
      `crossing onto ${domain} needs the user's confirmation. Ask them, then retry with confirm=true.`,
    )
  }
  scope.allow(domain)
}

/** Gate a side-effect action (upload, submit, or a destructive-looking click). */
export function assertSideEffect(kind: string, confirm: boolean, name?: string): void {
  if (confirm) return
  const named = name !== undefined && SIDE_EFFECT_NAME.test(name)
  if (kind === 'upload' || kind === 'submit' || named) {
    throw new BrowserError(
      BROWSER_ERRORS.confirmation,
      `this ${kind} is a side-effect and needs the user's confirmation. Ask them, then retry with confirm=true.`,
    )
  }
}

/** Whether an accessible name looks like a submit / pay / delete control. */
export function isSideEffectName(name: string | undefined): boolean {
  return name !== undefined && SIDE_EFFECT_NAME.test(name)
}
