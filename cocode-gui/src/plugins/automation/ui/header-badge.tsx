import { Badge } from '@cocode/ui'
import { useActiveSession, useAutomation, useAutomationSnapshot, useLayoutActions } from '../../../shell/runtime-context.tsx'

/** Session header chip: schedule count for the active session only. */
export function ScheduleHeaderBadge() {
  const session = useActiveSession()
  const automation = useAutomation()
  const snapshot = useAutomationSnapshot()
  const layout = useLayoutActions()

  if (session === undefined) return null
  // Subscribe so the count refreshes when schedules change.
  void snapshot.schedules
  const count = automation.scheduleCountFor(session.sessionId)
  if (count === 0) return null

  return (
    <button
      type="button"
      className="mr-1"
      onClick={() => {
        automation.focusSession(session.sessionId)
        layout.setCenterView('automation')
      }}
    >
      <Badge tone="neutral">{`定时 · ${String(count)}`}</Badge>
    </button>
  )
}
