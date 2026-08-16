import { describe, expect, it } from 'vitest'
import { buildSessionTree, flattenSessionTree } from '../../src/runtime/session-tree.ts'
import type { SessionSummary } from '../../src/runtime/sessions-fs.ts'

function session(
  id: string,
  createdAt: number,
  parentSession?: string,
  updatedAt?: number,
): SessionSummary {
  return {
    id,
    createdAt,
    path: `/sessions/${id}/session.jsonl`,
    ...(parentSession === undefined ? {} : { parentSession }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }
}

describe('session tree', () => {
  it('keeps legacy roots and orders sessions by latest activity', () => {
    const rows = flattenSessionTree(
      buildSessionTree([
        session('child-b', 30, 'root', 50),
        session('legacy', 5),
        session('root', 10, undefined, 40),
        session('child-a', 20, 'root', 45),
      ]),
      'child-b',
    )

    expect(rows.map((row) => [row.session.id, row.depth, row.current])).toEqual([
      ['root', 0, false],
      ['child-b', 1, true],
      ['child-a', 1, false],
      ['legacy', 0, false],
    ])
  })

  it('keeps an orphan visible and marks it', () => {
    const rows = flattenSessionTree(buildSessionTree([session('orphan', 1, 'missing')]))
    expect(rows).toMatchObject([{ session: { id: 'orphan' }, depth: 0, orphaned: true }])
  })

  it('does not recurse through a self-parent cycle', () => {
    const rows = flattenSessionTree(buildSessionTree([session('self', 1, 'self')]))
    expect(rows.map((row) => row.session.id)).toEqual(['self'])
  })
})
