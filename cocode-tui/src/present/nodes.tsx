/**
 * kind → row renderer. MessageList does not switch on kind.
 */

import type { ReactElement } from 'react'
import type { ConversationNode } from '../runtime/nodes/types.ts'
import { AssistantRow } from './components/AssistantRow.tsx'
import { NoticeRow } from './components/NoticeRow.tsx'
import { ToolCard } from './components/ToolCard.tsx'
import { UserRow } from './components/UserRow.tsx'

export type NodeView = (node: ConversationNode, verbose: boolean) => ReactElement | null

const views: Record<string, NodeView> = {
  user: (node, _verbose) => (node.kind === 'user' ? <UserRow node={node} /> : null),
  assistant: (node, verbose) =>
    node.kind === 'assistant' ? <AssistantRow node={node} verbose={verbose} /> : null,
  tool: (node, verbose) =>
    node.kind === 'tool' ? <ToolCard node={node} verbose={verbose} /> : null,
  notice: (node, verbose) => {
    if (node.kind !== 'notice') return null
    if (node.verboseOnly === true && !verbose) return null
    return <NoticeRow node={node} />
  },
}

export function renderNode(node: ConversationNode, verbose: boolean): ReactElement | null {
  const view = views[node.kind]
  if (view === undefined) return null
  return view(node, verbose)
}
