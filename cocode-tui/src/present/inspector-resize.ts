import { useEffect, useRef, useState } from 'react'
import type { TuiMouseEvent } from './mouse.ts'
import {
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_MAIN_COLUMNS,
  INSPECTOR_MIN_WIDTH,
  resolveInspectorLayout,
  type InspectorLayout,
} from './panel-layout.ts'

export {
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_MAIN_COLUMNS,
  INSPECTOR_MIN_WIDTH,
  resolveInspectorLayout,
}
export type { InspectorLayout }

export type InspectorResizeDrag = {
  startX: number
  startWidth: number
}

export function useInspectorResize(props: {
  terminalColumns: number
  visible: boolean
  defaultWidth: number
}) {
  const [preferredWidth, setPreferredWidth] = useState(props.defaultWidth)
  const [resizing, setResizing] = useState(false)
  const drag = useRef<InspectorResizeDrag | undefined>(undefined)
  const layout = resolveInspectorLayout(props.terminalColumns, preferredWidth)

  useEffect(() => {
    if (props.visible) return
    drag.current = undefined
    setResizing(false)
  }, [props.visible])

  const handleMouseEvent = (event: TuiMouseEvent): boolean => {
    const activeDrag = drag.current
    if (activeDrag !== undefined) {
      if (event.action === 'release' || (event.action === 'move' && event.button === 'none')) {
        drag.current = undefined
        setResizing(false)
        return true
      }
      if (event.action === 'move' && event.button === 0) {
        setPreferredWidth(
          resizeInspectorWidth({
            drag: activeDrag,
            currentX: event.x,
            terminalColumns: props.terminalColumns,
          }),
        )
      }
      return true
    }
    if (
      props.visible &&
      event.action === 'press' &&
      event.button === 0 &&
      inspectorResizeHandleContains(event.x, layout.startColumn)
    ) {
      drag.current = { startX: event.x, startWidth: layout.width }
      setResizing(true)
      return true
    }
    return false
  }

  return { layout, preferredWidth, resizing, handleMouseEvent }
}

export function resizeInspectorWidth(props: {
  drag: InspectorResizeDrag
  currentX: number
  terminalColumns: number
}): number {
  const requestedWidth = props.drag.startWidth + props.drag.startX - props.currentX
  return resolveInspectorLayout(props.terminalColumns, requestedWidth).width
}

export function inspectorResizeHandleContains(x: number, startColumn: number): boolean {
  return x === startColumn - 1 || x === startColumn
}
