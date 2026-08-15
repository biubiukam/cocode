/** Project the latest user turn without changing the session transcript. */

import type { ConversationNode } from './nodes/types.ts'

/**
 * Return the latest user message and every node that follows it when focus is
 * enabled. The original array is returned while focus is disabled, so callers
 * can keep the assembler snapshot as the source of truth.
 */
export function focusConversationNodes(
  nodes: readonly ConversationNode[],
  enabled: boolean,
): readonly ConversationNode[] {
  if (!enabled) return nodes
  const anchor = findLastUserIndex(nodes)
  return anchor < 0 ? [] : nodes.slice(anchor)
}

export function findLastUserIndex(nodes: readonly ConversationNode[]): number {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index]?.kind === 'user') return index
  }
  return -1
}
