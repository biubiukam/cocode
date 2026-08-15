/** Build a stable display tree from persisted session lineage metadata. */

import type { SessionSummary } from './sessions-fs.ts'

export type SessionTreeNode = {
  session: SessionSummary
  depth: number
  orphaned: boolean
  children: readonly SessionTreeNode[]
}

export type SessionTreeRow = {
  session: SessionSummary
  depth: number
  orphaned: boolean
  current: boolean
}

/** Build roots and descendants without dropping legacy or orphaned sessions. */
export function buildSessionTree(sessions: readonly SessionSummary[]): SessionTreeNode[] {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const children = new Map<string, SessionSummary[]>()
  const roots: SessionSummary[] = []

  for (const session of sessions) {
    const parent = session.parentSession
    if (parent === undefined || parent === session.id || !byId.has(parent)) {
      roots.push(session)
      continue
    }
    const siblings = children.get(parent) ?? []
    siblings.push(session)
    children.set(parent, siblings)
  }

  const sort = (items: SessionSummary[]): SessionSummary[] =>
    [...items].sort(
      (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    )
  const visit = (
    session: SessionSummary,
    depth: number,
    ancestors: ReadonlySet<string>,
  ): SessionTreeNode => {
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(session.id)
    const descendants = sort(children.get(session.id) ?? [])
      .filter((child) => !nextAncestors.has(child.id))
      .map((child) => visit(child, depth + 1, nextAncestors))
    return {
      session,
      depth,
      orphaned:
        session.parentSession !== undefined &&
        session.parentSession !== session.id &&
        !byId.has(session.parentSession),
      children: descendants,
    }
  }

  return sort(roots).map((root) => visit(root, 0, new Set()))
}

/** Flatten a tree for terminal pickers while retaining lineage depth. */
export function flattenSessionTree(
  tree: readonly SessionTreeNode[],
  currentSessionId?: string,
): SessionTreeRow[] {
  const rows: SessionTreeRow[] = []
  const append = (node: SessionTreeNode): void => {
    rows.push({
      session: node.session,
      depth: node.depth,
      orphaned: node.orphaned,
      current: node.session.id === currentSessionId,
    })
    for (const child of node.children) append(child)
  }
  for (const root of tree) append(root)
  return rows
}
