/**
 * Harness JSON-RPC transport for Cocode TUI.
 * Wire contract: cocode-harness `dsh-sdk-client` (stdio NDJSON-RPC).
 */

export type HarnessJsonRpcLaunch = {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}
