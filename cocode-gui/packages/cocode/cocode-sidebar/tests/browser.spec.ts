/**
 * Address-bar policy tests. Both halves import the same module — the toolbar
 * to normalize what was typed, the host to re-check every navigation the page
 * initiates — so these cases pin the shared contract: http(s) only, loopback
 * allowed (previewing a dev server is the point), the GUI's own origin never.
 */
import { describe, expect, it } from 'vitest'
import { normalizeBrowserUrl } from '../src/browser/url.ts'

const SELF = 'http://127.0.0.1:3080'

describe('normalizeBrowserUrl', () => {
  it('normalizes a bare domain to https', () => {
    expect(normalizeBrowserUrl('example.com', SELF)).toEqual({ kind: 'ok', url: 'https://example.com/' })
  })

  it('normalizes a host with a port to https rather than reading it as a scheme', () => {
    expect(normalizeBrowserUrl('example.com:8080/path', SELF)).toEqual({ kind: 'ok', url: 'https://example.com:8080/path' })
  })

  it('keeps an explicit http:// scheme', () => {
    expect(normalizeBrowserUrl('http://example.com/a?b=1', SELF)).toEqual({ kind: 'ok', url: 'http://example.com/a?b=1' })
  })

  it('accepts an IP literal', () => {
    expect(normalizeBrowserUrl('https://8.8.8.8/dns', SELF).kind).toBe('ok')
  })

  it('allows loopback dev servers in every spelling', () => {
    for (const input of [
      'http://localhost:5173/', 'http://LOCALHOST:5173/',
      'http://127.0.0.1:8000/', 'http://[::1]:4000/',
    ]) {
      expect(normalizeBrowserUrl(input, SELF), input).toEqual({ kind: 'ok', url: new URL(input).href })
    }
  })

  it('refuses non-http(s) schemes, with and without a //', () => {
    expect(normalizeBrowserUrl('javascript:alert(1)', SELF)).toEqual({ kind: 'blocked', reason: 'scheme' })
    expect(normalizeBrowserUrl('data:text/html,<b>x</b>', SELF)).toEqual({ kind: 'blocked', reason: 'scheme' })
    expect(normalizeBrowserUrl('file:///etc/passwd', SELF)).toEqual({ kind: 'blocked', reason: 'scheme' })
    expect(normalizeBrowserUrl('about:blank', SELF)).toEqual({ kind: 'blocked', reason: 'scheme' })
    expect(normalizeBrowserUrl('view-source:https://example.com', SELF)).toEqual({ kind: 'blocked', reason: 'scheme' })
    expect(normalizeBrowserUrl('ws://example.com/socket', SELF)).toEqual({ kind: 'blocked', reason: 'scheme' })
  })

  it('refuses the GUI origin so the automation profile cannot drive Cocode itself', () => {
    expect(normalizeBrowserUrl('http://127.0.0.1:3080/sidebar', SELF)).toEqual({ kind: 'blocked', reason: 'self' })
    expect(normalizeBrowserUrl('127.0.0.1:3080', 'https://127.0.0.1:3080')).toEqual({ kind: 'blocked', reason: 'self' })
    // A different port on the same host is a different origin: allowed.
    expect(normalizeBrowserUrl('http://127.0.0.1:9999/', SELF)).toEqual({ kind: 'ok', url: 'http://127.0.0.1:9999/' })
  })

  it('allows everything when the caller does not know its own origin', () => {
    expect(normalizeBrowserUrl('http://127.0.0.1:3080/sidebar').kind).toBe('ok')
    expect(normalizeBrowserUrl('http://127.0.0.1:3080/sidebar', 'not a url').kind).toBe('ok')
  })

  it('reports invalid input', () => {
    expect(normalizeBrowserUrl('', SELF)).toEqual({ kind: 'invalid' })
    expect(normalizeBrowserUrl('   ', SELF)).toEqual({ kind: 'invalid' })
    expect(normalizeBrowserUrl('ht tp://x', SELF)).toEqual({ kind: 'invalid' })
  })
})
