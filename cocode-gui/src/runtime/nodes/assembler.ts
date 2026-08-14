/**
 * Session-owned incremental engine: Definitions produce thread nodes.
 *
 * Window replace is wholesale. Live append is O(definitions) per event.
 * Node identity is preserved for unchanged Contexts so React only repaints
 * the rows that moved (same contract as the old ConversationFold).
 */

import type { HistoryEntry, TodoItem } from '@cocode/gui-connection'
import type { Publication } from '../notifier.ts'
import type { ConversationNode } from '../sessions/conversation.ts'
import { conversationContextKey, type ConversationMatch, type ConversationNodeDefinition } from './types.ts'
import type { NodeRegistry } from './registry.ts'

type InternalContext = {
  key: string
  kind: string
  id: string
  definition: ConversationNodeDefinition
  startSeq: number
  state: unknown
  matches: ConversationMatch[]
  dirty: boolean
  node: ConversationNode | null
}

const RANK: Record<Publication, number> = { none: 0, frame: 1, immediate: 2 }

function maxPublication(left: Publication, right: Publication): Publication {
  return RANK[left] >= RANK[right] ? left : right
}

export class ConversationNodeAssembler {
  private readonly contexts = new Map<string, InternalContext>()
  private readonly order: InternalContext[] = []
  private cache: readonly ConversationNode[] = []
  private cacheValid = true
  private highestSeq = -1
  private todos: readonly TodoItem[] = []

  constructor(private readonly registry: NodeRegistry) {}

  get currentTodos(): readonly TodoItem[] {
    return this.todos
  }

  get lastSeq(): number {
    return this.highestSeq
  }

  reset(): void {
    this.contexts.clear()
    this.order.length = 0
    this.cache = []
    this.cacheValid = true
    this.highestSeq = -1
    this.todos = []
  }

  /**
   * Replace the loaded window after open, resync, or gap repair.
   * @param entries - complete contiguous window.
   */
  replaceWindow(entries: readonly HistoryEntry[]): Publication {
    this.reset()
    let publication: Publication = 'none'
    for (const entry of entries) publication = maxPublication(publication, this.ingest(entry))
    return publication === 'none' ? 'immediate' : publication
  }

  /**
   * Fold one history page or live frame.
   * @param entry - raw event with optional host-computed render intent.
   */
  ingest(entry: HistoryEntry): Publication {
    const { event } = entry
    if (event.seq <= this.highestSeq) return 'none'
    this.highestSeq = event.seq

    const matched = this.matchEntry(entry)
    if (matched === undefined) return 'none'
    const publication = matched.definition.publication?.(matched.match) ?? 'immediate'
    if (matched.role === 'start') this.startContext(matched.definition, matched.id, matched.match)
    else this.updateContext(matched.definition, matched.id, matched.match)
    this.captureTodos()
    return publication
  }

  snapshot(): readonly ConversationNode[] {
    if (this.cacheValid) return this.cache
    const next: ConversationNode[] = []
    for (const context of this.order) {
      if (context.dirty) {
        context.node = context.definition.buildViewNode({
          kind: context.kind,
          id: context.id,
          startSeq: context.startSeq,
          state: context.state,
          matches: context.matches,
        })
        context.dirty = false
      }
      if (context.node !== null) next.push(context.node)
    }
    this.cache = next
    this.cacheValid = true
    return next
  }

  private matchEntry(entry: HistoryEntry): {
    definition: ConversationNodeDefinition
    match: ConversationMatch
    id: string
    role: 'start' | 'update'
  } | undefined {
    for (const definition of this.registry.entries()) {
      const result = definition.match(entry.event)
      if (result === null) continue
      return { definition, match: { ...entry, role: result.role }, id: result.id, role: result.role }
    }
    const fallback = this.registry.fallbackEntry()
    if (fallback === undefined) return undefined
    const result = fallback.match(entry.event)
    if (result === null) return undefined
    return { definition: fallback, match: { ...entry, role: result.role }, id: result.id, role: result.role }
  }

  private startContext(definition: ConversationNodeDefinition, id: string, match: ConversationMatch): void {
    const key = conversationContextKey(definition.kind, id)
    if (this.contexts.has(key)) {
      this.updateContext(definition, id, { ...match, role: 'update' })
      return
    }
    const context: InternalContext = {
      key,
      kind: definition.kind,
      id,
      definition,
      startSeq: match.event.seq,
      state: definition.start(match),
      matches: [match],
      dirty: true,
      node: null,
    }
    this.contexts.set(key, context)
    this.order.push(context)
    this.cacheValid = false
  }

  private updateContext(definition: ConversationNodeDefinition, id: string, match: ConversationMatch): void {
    const key = conversationContextKey(definition.kind, id)
    const context = this.contexts.get(key)
    if (context === undefined) {
      this.startContext(definition, id, { ...match, role: 'start' })
      return
    }
    context.state = definition.update(context.state, match)
    context.matches = [...context.matches, match]
    context.dirty = true
    this.cacheValid = false
  }

  private captureTodos(): void {
    const context = this.contexts.get(conversationContextKey('todo', 'session'))
    if (context === undefined) return
    const state = context.state as { todos?: readonly TodoItem[] }
    if (state.todos !== undefined) this.todos = state.todos
  }
}
