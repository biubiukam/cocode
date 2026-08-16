import { Box, measureElement, Text, type DOMElement } from 'ink'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { theme } from '../theme.ts'

export type ScrollMetrics = {
  offset: number
  maxOffset: number
  viewportRows: number
  overflowing: boolean
}

type ScrollablePanelProps = {
  height: number
  scrollOffset: number
  children: ReactNode
  onMetricsChange?: (metrics: ScrollMetrics) => void
  upHint?: string
  downHint?: string
}

/**
 * Clips arbitrary Ink content to a fixed-height viewport and moves the content
 * with a controlled row offset. Input handling stays with the caller so the
 * same container can be reused without introducing global key conflicts.
 */
export function ScrollablePanel(props: ScrollablePanelProps) {
  const contentRef = useRef<DOMElement>(null)
  const [contentRows, setContentRows] = useState(0)
  const metrics = scrollMetrics(props.height, contentRows, props.scrollOffset)

  useLayoutEffect(() => {
    if (contentRef.current === null) return
    const nextRows = measureElement(contentRef.current).height
    setContentRows((currentRows) => (currentRows === nextRows ? currentRows : nextRows))
  })

  useEffect(() => {
    props.onMetricsChange?.(metrics)
  }, [metrics.maxOffset, metrics.offset, metrics.overflowing, metrics.viewportRows, props])

  const showIndicators = metrics.overflowing && props.height >= 3
  return (
    <Box flexDirection="column" height={Math.max(1, Math.trunc(props.height))} overflowY="hidden">
      {/* The row is kept even with nothing hidden, so scrolling does not shift
          the content; only the hint itself is withheld. */}
      {showIndicators ? (
        <Text color={theme.mute} wrap="truncate-end">
          {metrics.offset > 0 ? `↑ ${props.upHint ?? ''} · ${String(metrics.offset)}` : ''}
        </Text>
      ) : null}
      <Box flexDirection="column" height={metrics.viewportRows} overflowY="hidden">
        <Box
          ref={contentRef}
          flexDirection="column"
          flexShrink={0}
          marginTop={-metrics.offset}
        >
          {props.children}
        </Box>
      </Box>
      {showIndicators ? (
        <Text color={theme.mute} wrap="truncate-end">
          {metrics.maxOffset > metrics.offset
            ? `↓ ${props.downHint ?? ''} · ${String(metrics.maxOffset - metrics.offset)}`
            : ''}
        </Text>
      ) : null}
    </Box>
  )
}

export function scrollMetrics(
  height: number,
  contentRows: number,
  scrollOffset: number,
): ScrollMetrics {
  const availableRows = Math.max(1, Math.trunc(height))
  const normalizedContentRows = Math.max(0, Math.trunc(contentRows))
  const overflowing = normalizedContentRows > availableRows
  const indicatorRows = overflowing && availableRows >= 3 ? 2 : 0
  const viewportRows = Math.max(1, availableRows - indicatorRows)
  const maxOffset = Math.max(0, normalizedContentRows - viewportRows)
  return {
    offset: Math.max(0, Math.min(maxOffset, Math.trunc(scrollOffset))),
    maxOffset,
    viewportRows,
    overflowing,
  }
}
