/**
 * Harness Host transport for Cocode GUI.
 * Wire contract: cocode-harness `dsh-host-apiproxy` (HTTP POST + dual downlink WebSocket).
 */

export * from './wire.ts'
export { HarnessTransport, type CallOptions, type HarnessHostEndpoint, type StreamHandlers } from './transport.ts'
export {
  USER_PACED_METHODS,
  type RemoteArgs,
  type RemoteEndpoint,
  type RemoteEndpointMap,
  type RemoteValue,
  type RequestPayload,
  type ResponseValue,
  type RpcMethod,
  type RpcMethodMap,
} from './methods.ts'

/**
 * Host cordis events the harness forwards verbatim over the host stream. The
 * allowlist is the harness's; a client subscribes by name and receives the
 * owner package's own argument list.
 */
export const FORWARDED_HOST_EVENTS = {
  /** The command registry gained or lost a command; any catalog is now stale. */
  commandsChange: 'commands/change',
  /** A credential reference changed; settings sections do not move when this happens. */
  credentialsUpdated: 'credentials/updated',
  /** The settings document changed on disk or from another client. */
  settingsDocumentUpdated: 'settings/document-updated',
  /** An LLM adapter gained or lost routes; the provider gallery is now stale. */
  llmAdaptersUpdated: 'llm/adapters-updated',
} as const

/**
 * Wire generation this client speaks. Compared against `host.describe`'s
 * `protocolVersion` when the harness reports one (RFC §10.5).
 */
export const COCODE_WIRE_PROTOCOL_VERSION = 1
