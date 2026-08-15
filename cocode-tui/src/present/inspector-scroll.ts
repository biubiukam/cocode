import { useInput } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TuiSnapshot } from '../runtime/app.ts'
import { mouseWheelDelta, type TuiMouseEvent } from './mouse.ts'
import type { ScrollMetrics } from './components/ScrollablePanel.tsx'

export type InspectorMouseInput = {
  id: number
  event: TuiMouseEvent
}

export function useInspectorScroll(props: {
  snapshot: TuiSnapshot
  maxRows: number
  mouseInput?: InspectorMouseInput
  hasActivity: boolean
  hasContext: boolean
  hasFiles: boolean
}) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const handledMouseInputId = useRef<number | undefined>(undefined)
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    offset: 0,
    maxOffset: 0,
    viewportRows: 1,
    overflowing: false,
  })
  const skillsToggleRow = skillsExpanded
    ? undefined
    : inspectorSkillsToggleRow(props)

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
    setSkillsExpanded(false)
  }, [props.snapshot.header.sessionId])

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
    if (
      skillsToggleRow === undefined ||
      mouseInput.event.action !== 'press' ||
      mouseInput.event.button !== 0
    ) return
    const panelRows = Math.max(1, props.maxRows - 3)
    const topIndicatorRows = metrics.overflowing && panelRows >= 3 ? 1 : 0
    const visibleToggleRow = 3 + topIndicatorRows + skillsToggleRow - metrics.offset
    if (mouseInput.event.y === visibleToggleRow) setSkillsExpanded(true)
  }, [metrics, props.maxRows, props.mouseInput, skillsToggleRow])

  return {
    displayedSkills: skillsExpanded ? props.snapshot.skills : props.snapshot.skills.slice(0, 3),
    skillsExpanded,
    scrollOffset,
    updateMetrics,
  }
}

export function inspectorSkillsToggleRow(props: {
  snapshot: TuiSnapshot
  hasActivity: boolean
  hasContext: boolean
  hasFiles: boolean
}): number | undefined {
  if (props.snapshot.skills.length <= 3) return undefined
  const telemetry = props.snapshot.status.telemetry
  const activityRows = props.hasActivity
    ? 1 +
      Number(telemetry.activity !== undefined) +
      Number((props.snapshot.status.subagents?.running ?? 0) > 0) +
      Number(props.snapshot.status.queueCount > 0)
    : 1
  const contextRows = props.hasContext
    ? Number(props.snapshot.status.tokens !== undefined) +
      Number(telemetry.contextPercent !== undefined) +
      Number(telemetry.cacheHitRate !== undefined) +
      Number(telemetry.tps !== undefined) +
      Number(telemetry.reasoningEffort !== undefined) +
      1
    : 1
  const filesRows = 1 + (props.hasFiles ? props.snapshot.composer.attachments.length : 1)
  const sessionRows =
    2 +
    Number(props.snapshot.status.sessionTitle !== undefined) +
    Number(props.snapshot.status.goal !== undefined) * 2 +
    Number(props.snapshot.status.todos.length > 0) +
    Number(props.snapshot.status.agentPreset !== undefined)
  const rowsBeforeSkills = [activityRows, contextRows, filesRows, sessionRows, 3].reduce(
    (rows, sectionRows) => rows + sectionRows + 2,
    0,
  )
  return rowsBeforeSkills + 7
}
