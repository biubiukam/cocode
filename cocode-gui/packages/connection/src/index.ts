/**
 * Harness Host transport for Cocode GUI.
 * Wire contract: cocode-harness `dsh-host-apiproxy` (HTTP POST + dual WebSocket).
 */

export type HarnessHostEndpoint = {
  /** Base URL, e.g. http://127.0.0.1:3080 */
  baseUrl: string
}
