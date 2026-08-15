import { describe, expect, it } from 'vitest'
import {
  buildSelectableLines,
  pointForMouse,
  selectedText,
} from '../../src/present/text-selection.ts'

describe('text selection', () => {
  const lines = buildSelectableLines(
    [
      {
        kind: 'assistant',
        id: 'answer',
        seq: 1,
        time: 0,
        turn: 1,
        step: 1,
        text: 'hello world from cocode',
        reasoning: '',
        streaming: false,
      },
      {
        kind: 'user',
        id: 'prompt',
        seq: 2,
        time: 0,
        text: 'next session should not be selected',
      },
    ],
    false,
    new Set(),
    20,
  )

  it('copies only selectable message text across wrapped rows', () => {
    expect(
      selectedText(lines, {
        anchor: { row: 2, column: 0 },
        focus: { row: 3, column: 6 },
      }),
    ).toBe('hello world from\ncocode')
  })

  it('clamps mouse coordinates to the transcript viewport', () => {
    expect(pointForMouse(-3, 200, 12, 80)).toEqual({ row: 0, column: 80 })
    expect(pointForMouse(20, -4, 12, 80)).toEqual({ row: 11, column: 0 })
  })
})
