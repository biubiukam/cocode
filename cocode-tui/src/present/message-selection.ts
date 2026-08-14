import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'

export function selectableMessageKeys(nodes: readonly ConversationNode[]): string[] {
  return nodes.filter((node) => node.kind !== 'notice').map((node) => nodeKey(node.kind, node.id))
}

export function moveMessageSelection(
  keys: readonly string[],
  current: string | null,
  delta: number,
): string | null {
  if (keys.length === 0) return null
  const currentIndex = current === null ? keys.length - 1 : keys.indexOf(current)
  const safeIndex = currentIndex < 0 ? keys.length - 1 : currentIndex
  const nextIndex = Math.max(0, Math.min(keys.length - 1, safeIndex + delta))
  return keys[nextIndex] ?? null
}
