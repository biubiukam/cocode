import { describe, expect, it } from 'vitest'
import {
  initialMessageSelectionState,
  reduceMessageSelection,
} from '../../src/present/message-selection-controller.ts'

describe('message selection controller', () => {
  it('ignores motion before a drag begins', () => {
    expect(
      reduceMessageSelection(initialMessageSelectionState, {
        type: 'moveDrag',
        point: { nodeKey: 'user:one', offset: 1 },
      }),
    ).toBe(initialMessageSelectionState)
  })

  it('selects a whole message from the keyboard path', () => {
    expect(
      reduceMessageSelection(initialMessageSelectionState, {
        type: 'activateMessage',
        selectedNodeId: 'user:one',
        text: 'hello',
      }),
    ).toEqual({
      active: true,
      dragging: false,
      selectedNodeId: 'user:one',
      selection: {
        anchor: { nodeKey: 'user:one', offset: 0 },
        focus: { nodeKey: 'user:one', offset: 5 },
      },
    })
  })

  it('clears a finished drag', () => {
    const ended = reduceMessageSelection(
      reduceMessageSelection(initialMessageSelectionState, {
        type: 'beginDrag',
        point: { nodeKey: 'user:one', offset: 0 },
      }),
      { type: 'endDrag' },
    )

    expect(reduceMessageSelection(ended, { type: 'clear' })).toEqual(initialMessageSelectionState)
  })

  it('keeps anchor and focus independent of drag direction', () => {
    const start = reduceMessageSelection(initialMessageSelectionState, {
      type: 'beginDrag',
      point: { nodeKey: 'user:one', offset: 2 },
    })
    const forward = reduceMessageSelection(start, {
      type: 'moveDrag',
      point: { nodeKey: 'user:two', offset: 4 },
    })
    const backward = reduceMessageSelection(start, {
      type: 'moveDrag',
      point: { nodeKey: 'user:zero', offset: 3 },
    })

    expect(forward.selection).toEqual({
      anchor: { nodeKey: 'user:one', offset: 2 },
      focus: { nodeKey: 'user:two', offset: 4 },
    })
    expect(backward.selection).toEqual({
      anchor: { nodeKey: 'user:one', offset: 2 },
      focus: { nodeKey: 'user:zero', offset: 3 },
    })
  })

  it('ignores motion after the drag has ended', () => {
    const started = reduceMessageSelection(initialMessageSelectionState, {
      type: 'beginDrag',
      point: { nodeKey: 'user:one', offset: 0 },
    })
    const ended = reduceMessageSelection(started, { type: 'endDrag' })

    expect(
      reduceMessageSelection(ended, {
        type: 'moveDrag',
        point: { nodeKey: 'user:two', offset: 1 },
      }),
    ).toBe(ended)
  })
})
