/**
 * Conversation Node contract. Assembler never switches on event.type.
 */

import type { SessionEvent } from '@cocode/tui-connection'

export type NodeMatch = { id: string; role: 'start' | 'update' }

export type NodeDefinition<State = unknown> = {
  kind: string
  fallback?: boolean
  match(event: SessionEvent): NodeMatch | null
  start(event: SessionEvent): State
  update(state: State, event: SessionEvent): State
  isComplete?(state: State): boolean
  buildViewNode(ctx: {
    kind: string
    id: string
    startSeq: number
    state: State
  }): ConversationNode | null
}

export type ConversationNode = UserNode | AssistantNode | ToolNode | NoticeNode

export type UserNode = {
  kind: 'user'
  id: string
  seq: number
  time: number
  text: string
}

export type AssistantNode = {
  kind: 'assistant'
  id: string
  seq: number
  time: number
  turn: number
  step: number
  text: string
  reasoning: string
  streaming: boolean
  usage?: { input: number; output: number }
}

export type ToolNode = {
  kind: 'tool'
  id: string
  seq: number
  time: number
  callId: string
  name: string
  args: string
  status: 'running' | 'success' | 'error'
  view?: ToolView
  result?: string
  error?: { name: string; code: string }
}

export type ToolView =
  | { kind: 'read'; path?: string }
  | { kind: 'search'; query?: string }
  | { kind: 'diff'; paths?: readonly string[] }
  | { kind: 'terminal'; command?: string }

export type NoticeNode = {
  kind: 'notice'
  id: string
  seq: number
  time: number
  tone: 'info' | 'error'
  message: string
  verboseOnly?: boolean
}

export function nodeKey(kind: string, id: string): string {
  return `${kind}:${id}`
}
