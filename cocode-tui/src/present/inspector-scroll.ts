import { useInput } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mouseWheelDelta, type TuiMouseEvent } from './mouse.ts'
import type { ScrollMetrics } from './components/ScrollablePanel.tsx'

export type InspectorMouseInput = {
  id: number
  event: TuiMouseEvent
}

export function useInspectorScroll(props: {
  sessionId: string
  maxRows: number
  mouseInput?: InspectorMouseInput
}) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const handledMouseInputId = useRef<number | undefined>(undefined)
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    offset: 0,
    maxOffset: 0,
    viewportRows: 1,
    overflowing: false,
  })
  const updateMetrics = useCallback((nextMetrics: ScrollMetrics) => {
    setMetrics((currentMetrics) =>
      currentMetrics.offset === nextMetrics.offset &&
      currentMetrics.maxOffset === nextMetrics.maxOffset &&
      currentMetrics.viewportRows === nextMetrics.viewportRows &&
      currentMetrics.overflowing === nextMetrics.overflowing
        ? currentMetrics
        : nextMetrics,
    )
    setScrollOffset(nextMetrics.offset)
  }, [])

  useInput(
    (_input, key) => {
      if (!key.meta) return
      const direction = key.upArrow || key.pageUp ? -1 : key.downArrow || key.pageDown ? 1 : 0
      if (direction === 0) return
      const rows = key.pageUp || key.pageDown ? metrics.viewportRows : 1
      setScrollOffset((currentOffset) =>
        Math.max(0, Math.min(metrics.maxOffset, currentOffset + direction * rows)),
      )
    },
    { isActive: metrics.overflowing },
  )

  useEffect(() => {
    setScrollOffset(0)
  }, [props.sessionId])

  useEffect(() => {
    const mouseInput = props.mouseInput
    if (mouseInput === undefined) return
    if (handledMouseInputId.current === mouseInput.id) return
    handledMouseInputId.current = mouseInput.id
    const wheelDelta = mouseWheelDelta(mouseInput.event)
    if (wheelDelta !== undefined) {
      const rows = Math.max(1, Math.floor(metrics.viewportRows / 3))
      setScrollOffset((currentOffset) =>
        Math.max(0, Math.min(metrics.maxOffset, currentOffset - wheelDelta * rows)),
      )
      return
    }
  }, [metrics, props.mouseInput])

  return {
    scrollOffset,
    updateMetrics,
  }
}
