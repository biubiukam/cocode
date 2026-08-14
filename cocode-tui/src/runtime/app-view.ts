/** Formatting helpers used by the session state machine. */

import type { ConversationNode } from './nodes/types.ts'
import type { TuiSnapshot } from './app.ts'
import { redactSecrets } from './diagnostics.ts'
import { displayError, formatError } from './errors/index.ts'

export function composerPlaceholder(agent: TuiSnapshot['agent']): string {
  if (agent === 'starting') return 'Connecting…'
  if (agent === 'running') return 'Working — Esc then again to quit'
  if (agent === 'dead') return 'Runtime stopped — /exit'
  return 'Type a message  / for commands'
}

export function statusLine(agent: TuiSnapshot['agent'], runtimeName: string): string {
  const name = runtimeName === '' ? 'runtime' : runtimeName
  if (agent === 'running') {
    return `${name} · running · protocol cannot cancel`
  }
  return `${name} · ${agent}`
}

export function latestUsage(
  nodes: readonly ConversationNode[],
): { input: number; output: number } | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node?.kind === 'assistant' && node.usage !== undefined) {
      return node.usage
    }
  }
  return undefined
}

export function errorMessage(error: unknown): string {
  return displayError(error)
}

export function startErrorMessage(error: unknown): string {
  return formatError('RUNTIME_INIT_FAILED', {
    detail: redactSecrets(error instanceof Error ? error.message : String(error)),
  })
}
