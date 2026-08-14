/** Route runtime notifications into app-owned state callbacks. */

import type { SessionEvent, TuiNotification } from '@cocode/tui-connection'

export function handleNotification(
  notification: TuiNotification,
  host: {
    sessionId: string
    ingest: (event: SessionEvent) => void
    isDeadOrExiting: () => boolean
    setAgent: (agent: 'idle' | 'running') => void
    clearInterrupt: () => void
    notice: (message: string) => void
    emit: () => void
  },
): void {
  if (notification.method === 'session.event') {
    if (notification.params.sessionId !== host.sessionId) return
    host.ingest(notification.params.event)
    host.emit()
    return
  }
  if (notification.method === 'session.status') {
    if (notification.params.sessionId !== host.sessionId) return
    if (host.isDeadOrExiting()) return
    host.setAgent(notification.params.status)
    host.clearInterrupt()
    host.emit()
    return
  }
  if (notification.method === 'subagent.started') {
    if (notification.params.parentSessionId !== host.sessionId) return
    host.notice(`Subagent ${notification.params.childSessionId}`)
    host.emit()
    return
  }
  if (notification.params.parentSessionId !== host.sessionId) return
  host.notice(`Subagent finished ${notification.params.childSessionId}`)
  host.emit()
}
