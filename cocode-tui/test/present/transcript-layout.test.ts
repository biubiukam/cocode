import { beforeEach, describe, expect, it } from 'vitest'
import type { AssistantNode, ConversationNode } from '../../src/runtime/nodes/types.ts'
import { nodeKey } from '../../src/runtime/nodes/types.ts'
import {
  clearTranscriptLayoutCache,
  measureTranscript,
  transcriptLayoutCacheStats,
} from '../../src/present/transcript-layout.ts'
import { estimateNodeRows, nodeAttached } from '../../src/present/visible-tail.ts'

function user(id: string, text: string): ConversationNode {
  return { kind: 'user', id, seq: Number(id), time: Number(id), text }
}

function assistant(id: string, text: string): AssistantNode {
  return {
    kind: 'assistant',
    id,
    seq: Number(id),
    time: Number(id),
    turn: 1,
    step: 1,
    text,
    reasoning: '',
    streaming: false,
  }
}

/** Uncached reference measurement, mirroring the pre-cache implementation. */
function referenceRows(
  nodes: readonly ConversationNode[],
  verbose = false,
  expandedNodeIds?: ReadonlySet<string>,
  maxColumns?: number,
): number[] {
  return nodes.map((node, index) =>
    estimateNodeRows(
      node,
      verbose,
      expandedNodeIds?.has(nodeKey(node.kind, node.id)) === true,
      maxColumns,
      nodeAttached(nodes, index),
    ),
  )
}

describe('measureTranscript', () => {
  beforeEach(() => {
    clearTranscriptLayoutCache()
  })

  it('reports the same rows as an uncached estimate', () => {
    const nodes = [user('1', 'one'), assistant('2', '## head\n\nbody text'), user('3', 'three')]

    expect(measureTranscript({ nodes, maxRows: 10, maxColumns: 40 }).rows).toEqual(
      referenceRows(nodes, false, undefined, 40),
    )
  })

  it('keeps the newest rows at the bottom and older rows after scrolling up', () => {
    const nodes = [user('1', 'one'), user('2', 'two'), user('3', 'three')]

    expect(
      measureTranscript({ nodes, maxRows: 4 }).window.nodes.map((node) => node.id),
    ).toEqual(['2', '3'])
    expect(
      measureTranscript({ nodes, maxRows: 4, scrollOffset: 2 }).window.nodes.map(
        (node) => node.id,
      ),
    ).toEqual(['1', '2'])
  })

  it('tracks rows hidden inside one message taller than the viewport', () => {
    const nodes = [user('1', '1\n2\n3\n4\n5\n6\n7\n8')]

    expect(measureTranscript({ nodes, maxRows: 4 }).window.hiddenRowsBefore).toBe(5)
    expect(
      measureTranscript({ nodes, maxRows: 4, scrollOffset: 3 }).window.hiddenRowsBefore,
    ).toBe(2)
  })

  it('reports the window start index inside the measured nodes', () => {
    const nodes = [user('1', 'one'), user('2', 'two'), user('3', 'three')]

    expect(measureTranscript({ nodes, maxRows: 4 }).window.startIndex).toBe(1)
  })

  it('clamps the scroll range to the row budget', () => {
    const nodes = [user('1', 'abcdefghij')]

    expect(measureTranscript({ nodes, maxRows: 3, maxColumns: 5 }).maxOffset).toBeGreaterThan(0)
    expect(measureTranscript({ nodes, maxRows: 0 }).maxOffset).toBe(0)
    expect(measureTranscript({ nodes, maxRows: 0 }).window.nodes).toEqual([])
  })

  it('returns an empty window when compact mode hides every node', () => {
    const hidden: ConversationNode = {
      kind: 'notice',
      id: '1',
      seq: 1,
      time: 1,
      tone: 'info',
      message: 'turn/start',
      verboseOnly: true,
    }

    expect(measureTranscript({ nodes: [hidden], maxRows: 10 }).window.nodes).toEqual([])
    expect(
      measureTranscript({ nodes: [hidden], maxRows: 10, verbose: true }).window.nodes,
    ).toEqual([hidden])
  })

  it('reuses memoised rows for an unchanged transcript', () => {
    const nodes = [user('1', 'one'), assistant('2', 'body'), user('3', 'three')]

    measureTranscript({ nodes, maxRows: 10, maxColumns: 40 })
    const cold = transcriptLayoutCacheStats().misses
    measureTranscript({ nodes, maxRows: 10, maxColumns: 40 })

    expect(cold).toBe(nodes.length)
    expect(transcriptLayoutCacheStats().misses).toBe(cold)
    expect(transcriptLayoutCacheStats().hits).toBe(nodes.length)
  })

  it('re-measures only the node republished with new content', () => {
    const nodes = [user('1', 'one'), assistant('2', 'body'), user('3', 'three')]
    measureTranscript({ nodes, maxRows: 10, maxColumns: 40 })

    const grown = [...nodes]
    grown[1] = assistant('2', 'body\nmore body')
    const layout = measureTranscript({ nodes: grown, maxRows: 10, maxColumns: 40 })

    expect(transcriptLayoutCacheStats().misses).toBe(nodes.length + 1)
    expect(layout.rows).toEqual(referenceRows(grown, false, undefined, 40))
  })

  it('measures each view variant separately', () => {
    const nodes = [assistant('1', 'body')]

    const narrow = measureTranscript({ nodes, maxRows: 10, maxColumns: 20 })
    const wide = measureTranscript({ nodes, maxRows: 10, maxColumns: 80 })

    expect(transcriptLayoutCacheStats().misses).toBe(2)
    expect(narrow.rows).toEqual(referenceRows(nodes, false, undefined, 20))
    expect(wide.rows).toEqual(referenceRows(nodes, false, undefined, 80))
  })

  it('drops memoised rows when the cache is cleared', () => {
    const nodes = [user('1', 'one')]

    measureTranscript({ nodes, maxRows: 10 })
    clearTranscriptLayoutCache()
    measureTranscript({ nodes, maxRows: 10 })

    expect(transcriptLayoutCacheStats().misses).toBe(1)
  })
})
