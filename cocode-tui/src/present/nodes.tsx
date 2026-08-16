/**
 * kind → row renderer. MessageList does not switch on kind.
 */

import type { ReactElement } from 'react'
import type { ConversationNode } from '../runtime/nodes/types.ts'
import { AssistantRow } from './components/AssistantRow.tsx'
import { ContextRow } from './components/ContextRow.tsx'
import { NoticeRow } from './components/NoticeRow.tsx'
import { ToolCard } from './components/ToolCard.tsx'
import { UserRow } from './components/UserRow.tsx'
import type { UiLocale } from '../runtime/ui-locale.ts'

export type NodeRenderOptions = {
  expanded?: boolean
  selected?: boolean
  locale?: UiLocale
  maxColumns?: number
  expandedLevel?: 0 | 1 | 2
}

export type NodeView = (
  node: ConversationNode,
  verbose: boolean,
  options: NodeRenderOptions,
) => ReactElement | null

const views: Record<string, NodeView> = {
  user: (node, _verbose, options) =>
    node.kind === 'user' ? (
      <UserRow
        node={node}
        selected={options.selected === true}
        locale={options.locale ?? 'en'}
        maxColumns={options.maxColumns}
      />
    ) : null,
  context: (node, verbose, options) =>
    node.kind === 'context' && (verbose || options.expanded === true) ? (
      <ContextRow
        node={node}
        expanded={options.expanded === true}
        locale={options.locale ?? 'en'}
      />
    ) : null,
  assistant: (node, verbose, options) =>
    node.kind === 'assistant' ? (
      <AssistantRow
        node={node}
        verbose={verbose || options.expanded === true}
        selected={options.selected === true}
        locale={options.locale ?? 'en'}
        maxColumns={options.maxColumns}
        expandedLevel={options.expandedLevel}
      />
    ) : null,
  tool: (node, verbose, options) =>
    node.kind === 'tool' ? (
      <ToolCard
        node={node}
        verbose={verbose || options.expanded === true}
        locale={options.locale ?? 'en'}
        maxColumns={options.maxColumns}
      />
    ) : null,
  notice: (node, verbose) => {
    if (node.kind !== 'notice') return null
    if (node.verboseOnly === true && !verbose) return null
    return <NoticeRow node={node} />
  },
}

export function renderNode(
  node: ConversationNode,
  verbose: boolean,
  options: NodeRenderOptions = {},
): ReactElement | null {
  const view = views[node.kind]
  if (view === undefined) return null
  return view(node, verbose, options)
}
