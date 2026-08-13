/**
 * Cocode TUI entry.
 * Spawns a harness JSON-RPC runtime and renders in the terminal.
 */

import type { HarnessJsonRpcLaunch } from '@cocode/tui-connection'

const launch: HarnessJsonRpcLaunch = {
  command: process.env.COCODE_HARNESS_CMD ?? 'node',
  args: (process.env.COCODE_HARNESS_ARGS ?? '--help').split(' '),
}

console.log('Cocode TUI scaffold — configure COCODE_HARNESS_CMD / COCODE_HARNESS_ARGS')
console.log('See ../cocode-harness/examples/jsonrpc-agent/cordis.yml for a runnable profile.')
console.log('Launch spec:', launch)
