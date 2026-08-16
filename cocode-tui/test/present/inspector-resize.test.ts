import { describe, expect, it } from 'vitest'
import {
  inspectorResizeHandleContains,
  resizeInspectorWidth,
  resolveInspectorLayout,
} from '../../src/present/inspector-resize.ts'

describe('Inspector resize layout', () => {
  it('keeps both panels usable within the terminal width', () => {
    expect(resolveInspectorLayout(160, 10)).toEqual({
      width: 24,
      mainColumns: 134,
      startColumn: 136,
    })
    expect(resolveInspectorLayout(160, 90)).toEqual({
      width: 60,
      mainColumns: 98,
      startColumn: 100,
    })
    expect(resolveInspectorLayout(120, 60)).toEqual({
      width: 58,
      mainColumns: 60,
      startColumn: 62,
    })
  })

  it('expands on left drag and shrinks on right drag', () => {
    const drag = { startX: 131, startWidth: 30 }
    expect(resizeInspectorWidth({ drag, currentX: 121, terminalColumns: 160 })).toBe(40)
    expect(resizeInspectorWidth({ drag, currentX: 141, terminalColumns: 160 })).toBe(24)
    expect(resizeInspectorWidth({ drag, currentX: 61, terminalColumns: 120 })).toBe(58)
  })

  it('uses the margin and left border as the resize handle', () => {
    expect(inspectorResizeHandleContains(100, 101)).toBe(true)
    expect(inspectorResizeHandleContains(101, 101)).toBe(true)
    expect(inspectorResizeHandleContains(102, 101)).toBe(false)
    expect(inspectorResizeHandleContains(99, 101)).toBe(false)
  })
})
