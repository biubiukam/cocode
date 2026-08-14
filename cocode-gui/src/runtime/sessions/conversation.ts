/**
 * Thread node shapes the middle column paints.
 *
 * Folding lives in ConversationNodeAssembler + per-plugin Definitions.
 * This file is the view-model only.
 */

import type { ContentBlock, TokenUsage, ToolCallView, ToolResultView } from '@cocode/gui-connection'

export type ToolNodeStatus = 'running' | 'awaiting-approval' | 'success' | 'error'

/** A tool call waiting for the user's decision, as routed from `approval/requested`. */
export type PendingToolApproval = {
  approvalId: string
  rpcId: string
  toolName: string
  reason?: string
}

export type UserNode = {
  kind: 'user'
  id: string
  seq: number
  time: number
  blocks: ContentBlock[]
  synthetic: boolean
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
  usage?: TokenUsage
}

export type ToolNode = {
  kind: 'tool'
  id: string
  seq: number
  time: number
  callId: string
  name: string
  args: string
  status: ToolNodeStatus
  callView?: ToolCallView
  resultView?: ToolResultView
  resultBlocks?: ContentBlock[]
  error?: { name: string; code: string }
  approval?: PendingToolApproval
  finishedAt?: number
}

export type NoticeNode = {
  kind: 'notice'
  id: string
  seq: number
  time: number
  tone: 'info' | 'error'
  message: string
  /** Optional chrome action (e.g. schedule notice → open automation). */
  action?: { label: string; kind: 'open-automation' }
}

export type CommandNode = {
  kind: 'command'
  id: string
  seq: number
  time: number
  name: string
  args?: string
  status: 'running' | 'success' | 'error'
  text?: string
}

export type FallbackNode = {
  kind: 'fallback'
  id: string
  seq: number
  time: number
  eventType: string
}

export type ConversationNode =
  | UserNode
  | AssistantNode
  | ToolNode
  | NoticeNode
  | CommandNode
  | FallbackNode

/** Reads the visible text out of model-facing content blocks. */
export function blocksToText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is ContentBlock & { text: string } => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

export function reasoningToText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is ContentBlock & { text: string } => block.type === 'reasoning' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}
