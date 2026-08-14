/**
 * Conversation Node contract (harness assembler subset).
 *
 * A Definition owns one event family. The assembler never switches on type.
 */

import type { HistoryEntry, SessionEvent } from '@cocode/gui-connection'
import type { Publication } from '../notifier.ts'
import type { ConversationNode } from '../sessions/conversation.ts'

export type ConversationMatchResult = {
  id: string
  role: 'start' | 'update'
}

export type ConversationMatch = HistoryEntry & {
  role: 'start' | 'update'
}

export type ConversationNodeContext<State = unknown> = {
  kind: string
  id: string
  startSeq: number
  state: State
  matches: readonly ConversationMatch[]
}

export type ConversationNodeDefinition<State = unknown> = {
  kind: string
  /** When true, this Definition claims events no other Definition matched. */
  fallback?: boolean
  match(event: SessionEvent): ConversationMatchResult | null
  start(match: ConversationMatch): State
  update(state: State, match: ConversationMatch): State
  publication?(match: ConversationMatch): Publication
  /**
   * Materialize the thread row. `null` keeps the Context for state (todos)
   * without painting a node.
   */
  buildViewNode(context: ConversationNodeContext<State>): ConversationNode | null
}

export function conversationContextKey(kind: string, id: string): string {
  return `${kind}:${id}`
}
