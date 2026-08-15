/** Runtime capability probing for optional JSON-RPC methods. */

import { randomUUID } from 'node:crypto'
import type { SessionEvent, TuiCapabilitySnapshot, TuiRuntimeAdvertisement } from './types.ts'

type ProbeClient = {
  request(method: string, params?: object, timeoutMs?: number): Promise<unknown>
}

const CAPABILITY_PROBE_TIMEOUT_MS = 1_000

/** Probe optional methods without creating or changing a user session. */
export async function probeRuntimeCapabilities(
  client: ProbeClient,
  options: {
    onRequest?: boolean
    probeSessionId?: string
    advertised?: TuiRuntimeAdvertisement
  } = {},
): Promise<TuiCapabilitySnapshot> {
  const probeSessionId = options.probeSessionId ?? `cocode-capability-probe-${randomUUID()}`
  const capabilities = emptyCapabilities(options.onRequest === true)
  if (options.advertised !== undefined) {
    capabilities.approval = options.advertised.approval && options.onRequest === true
    capabilities.permissionMode = options.advertised.permissionMode
    capabilities.planMode = options.advertised.planMode
    capabilities.sessionList = options.advertised.sessionList
    // The running submit path uses `steer`; queue is implemented locally and
    // must not accidentally enable a wire mode the runtime does not advertise.
    capabilities.promptMode = options.advertised.promptModes.includes('steer')
    capabilities.queueMode = options.advertised.promptModes.includes('queue')
  }
  const errors: TuiCapabilitySnapshot['errors'] = {}

  if (options.onRequest !== true) {
    errors.onRequest = 'SDK client does not expose onRequest'
    if (options.advertised?.approval === true) {
      errors.approval = 'runtime advertised approval but SDK client has no request handler'
    }
  }

  const probes: {
    name: keyof typeof capabilities
    method: string
    params: Record<string, unknown>
    validate?: (result: unknown) => boolean
    unavailable?: (error: unknown) => boolean
  }[] = [
    {
      name: 'cancel',
      method: 'session/cancel',
      params: { sessionId: probeSessionId, keepInbox: true },
      validate: (result) => isRecord(result) && typeof result.cancelled === 'boolean',
    },
    {
      name: 'open',
      method: 'session/open',
      params: { sessionId: probeSessionId },
      validate: (result) => isRecord(result) && typeof result.opened === 'boolean',
    },
    {
      name: 'fork',
      method: 'session/fork',
      params: { sourceSessionId: probeSessionId, boundary: 0 },
      validate: isForkResult,
    },
    {
      name: 'rewind',
      method: 'session/fork',
      params: { sourceSessionId: probeSessionId, rewindToMessageSeq: 1 },
      validate: isForkResult,
    },
    {
      name: 'skills',
      method: 'skills/list',
      params: { sessionId: probeSessionId },
      validate: (result) => isRecord(result) && Array.isArray(result.skills),
      unavailable: (error) =>
        /skills registry is not configured|skills.*unavailable/i.test(errorMessage(error)),
    },
    {
      name: 'sessionList',
      method: 'session/list',
      params: {},
      validate: (result) => isRecord(result) && Array.isArray(result.sessions),
    },
    {
      name: 'permissionMode',
      method: 'permission/mode',
      params: { sessionId: probeSessionId },
      validate: (result) =>
        isRecord(result) && typeof result.mode === 'string' && Array.isArray(result.supportedModes),
    },
    {
      name: 'planMode',
      method: 'plan/mode',
      params: { sessionId: probeSessionId },
      validate: (result) => isRecord(result) && typeof result.active === 'boolean',
    },
  ]

  for (const probe of probes) {
    try {
      const result = await client.request(probe.method, probe.params, CAPABILITY_PROBE_TIMEOUT_MS)
      if (probe.validate?.(result) === false) {
        errors[probe.name] = `${probe.method} returned an invalid capability probe result`
        continue
      }
      capabilities[probe.name] = true
    } catch (error) {
      if (isUnsupportedMethodError(error)) {
        errors[probe.name] = 'protocol method is not supported by the runtime'
      } else if (isUnsupportedProbeParameter(probe.name, error)) {
        errors[probe.name] = 'runtime rejected the capability-specific parameters'
      } else if (isTerminalTransportError(error) || probe.unavailable?.(error)) {
        errors[probe.name] = compactError(error)
      } else {
        // A semantic error for the random session still proves that the
        // method and its capability-specific parameters were routed.
        capabilities[probe.name] = true
      }
    }
  }

  return {
    source: 'runtime',
    capabilities,
    errors,
    ...(options.advertised === undefined ? {} : { modes: options.advertised }),
  }
}

export function fallbackCapabilitySnapshot(): TuiCapabilitySnapshot {
  return {
    source: 'fallback',
    capabilities: emptyCapabilities(false),
    errors: { onRequest: 'runtime capability probe has not run' },
  }
}

export function unavailableCapabilitySnapshot(detail: string): TuiCapabilitySnapshot {
  return {
    source: 'runtime',
    capabilities: emptyCapabilities(false),
    errors: Object.fromEntries(
      Object.keys(emptyCapabilities(false)).map((name) => [name, detail]),
    ) as TuiCapabilitySnapshot['errors'],
  }
}

function emptyCapabilities(onRequest: boolean): TuiCapabilitySnapshot['capabilities'] {
  return {
    cancel: false,
    open: false,
    fork: false,
    rewind: false,
    skills: false,
    onRequest,
    approval: false,
    permissionMode: false,
    planMode: false,
    sessionList: false,
    promptMode: false,
    queueMode: false,
  }
}

function isUnsupportedMethodError(error: unknown): boolean {
  if (isRecord(error) && (error.code === -32601 || error.code === 'METHOD_NOT_FOUND')) return true
  return /unknown(?: [^\n]*)? method|method not found|unsupported method|not implemented/i.test(
    errorMessage(error),
  )
}

function isUnsupportedProbeParameter(
  capability: keyof TuiCapabilitySnapshot['capabilities'],
  error: unknown,
): boolean {
  if (capability !== 'rewind') return false
  return /rewindToMessageSeq|unknown (?:parameter|field)|unexpected (?:parameter|property)|invalid params/i.test(
    errorMessage(error),
  )
}

function isTerminalTransportError(error: unknown): boolean {
  if (!isRecord(error)) return false
  return error.name === 'TransportClosedError' || error.name === 'RequestTimeoutError'
}

function compactError(error: unknown): string {
  const message = errorMessage(error)
    .replace(/[\r\n]+/g, ' ')
    .trim()
  return message.length > 240 ? `${message.slice(0, 237)}...` : message
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isForkResult(
  value: unknown,
): value is { sessionId: string; seedLength: number; seed: SessionEvent[] } {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.seedLength === 'number' &&
    Number.isSafeInteger(value.seedLength) &&
    value.seedLength >= 0 &&
    Array.isArray(value.seed) &&
    value.seed.every(isSessionEvent)
  )
}

function isSessionEvent(value: unknown): value is SessionEvent {
  if (!isRecord(value)) return false
  return (
    typeof value.type === 'string' &&
    typeof value.seq === 'number' &&
    typeof value.time === 'number'
  )
}
