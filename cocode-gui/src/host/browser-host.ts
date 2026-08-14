/**
 * The browser carrier's HostBridge. It owns no native capability, so every
 * optional member is absent and consumers degrade through capability checks.
 *
 * The browser is a first-class carrier, not a fallback: a harness running on
 * another machine still has to be usable, and it is also Cocode's default
 * development environment so the path cannot rot unnoticed (RFC §4.2, §13).
 */

import type { HarnessEndpointInfo, HarnessHostApi, HostBridge } from './bridge.ts'

/**
 * Resolves the endpoint a browser-served frontend should talk to.
 * A build-time URL wins (development against a separate harness); otherwise the
 * page assumes it is served same-origin with the API, which is what the
 * production reverse-proxy deployment provides.
 */
function browserEndpoint(): string {
  const configured = import.meta.env.VITE_COCODE_HARNESS_URL
  if (typeof configured === 'string' && configured !== '') return configured
  return ''
}

/**
 * Probes an endpoint's reachability so the connect mode can report a real state
 * instead of leaving the shell in an indefinite "starting".
 */
async function probe(baseUrl: string): Promise<HarnessEndpointInfo> {
  const url = new URL('/api/host.describe', baseUrl === '' ? globalThis.location.href : baseUrl)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'host.describe', payload: {} }),
    })
    if (!response.ok) {
      return { mode: 'connect', baseUrl, state: { phase: 'failed', message: `harness answered HTTP ${String(response.status)}` } }
    }
    return { mode: 'connect', baseUrl, state: { phase: 'ready', baseUrl } }
  }
  catch (error) {
    return {
      mode: 'connect',
      baseUrl,
      state: { phase: 'failed', message: error instanceof Error ? error.message : String(error) },
    }
  }
}

function createBrowserHarnessApi(): HarnessHostApi {
  const listeners = new Set<(info: HarnessEndpointInfo) => void>()
  const baseUrl = browserEndpoint()

  const run = async (): Promise<HarnessEndpointInfo> => {
    const info = await probe(baseUrl)
    for (const listener of listeners) listener(info)
    return info
  }

  return {
    resolve: run,
    restart: run,
    onStateChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Builds the browser carrier's bridge. */
export function createBrowserHostBridge(): HostBridge {
  return { platform: 'browser', harness: createBrowserHarnessApi() }
}

/**
 * Returns the active carrier's bridge: the preload-injected one on the desktop,
 * the browser implementation everywhere else.
 * @returns the resolved HostBridge for this carrier.
 */
export function resolveHostBridge(): HostBridge {
  return globalThis.window.cocode ?? createBrowserHostBridge()
}
