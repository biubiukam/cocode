import type { ConversationNode, QuestionAnswer } from '../../../runtime/index.ts'
import { UserMessage } from '../../../conversation/nodes/user-message.tsx'
import { AssistantMessage } from '../../../conversation/nodes/assistant-message.tsx'
import { ToolCard } from '../../../conversation/nodes/tool-card.tsx'
import { NoticeRow } from '../../../conversation/nodes/misc-nodes.tsx'
import { CommandRow, FallbackRow } from './extra-nodes.tsx'

export type ChatNodeOwner = {
  node: ConversationNode
  onApprove(approvalId: string): void
  onReject(approvalId: string): void
  onAnswer(answers: QuestionAnswer[]): void
  onCancelQuestion(): void
}

export function UserChatNode({ node }: ChatNodeOwner) {
  if (node.kind !== 'user') return null
  return <UserMessage node={node} />
}

export function AssistantChatNode({ node }: ChatNodeOwner) {
  if (node.kind !== 'assistant') return null
  return <AssistantMessage node={node} />
}

export function ToolChatNode({ node, onApprove, onReject }: ChatNodeOwner) {
  if (node.kind !== 'tool') return null
  return <ToolCard node={node} onApprove={onApprove} onReject={onReject} />
}

export function NoticeChatNode({ node }: ChatNodeOwner) {
  if (node.kind !== 'notice') return null
  return <NoticeRow node={node} />
}

export function CommandChatNode({ node }: ChatNodeOwner) {
  if (node.kind !== 'command') return null
  return <CommandRow node={node} />
}

export function FallbackChatNode({ node }: ChatNodeOwner) {
  if (node.kind !== 'fallback') return null
  return <FallbackRow node={node} />
}
