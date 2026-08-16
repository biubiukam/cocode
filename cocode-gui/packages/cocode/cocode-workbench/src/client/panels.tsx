import { useEffect, useSyncExternalStore } from "react"
import type { WorkbenchPanelProps } from "./model.ts"
import { State } from "./panel-state.tsx"
import css from "./panels.module.css"

export function JobsPanel(props: WorkbenchPanelProps) {
  const sessionId = props.scope.sessionId
  const sessions = props.sessions
  const emptySnapshot = { jobsBySession: {} as Readonly<Record<string, readonly import('@deepseek-ai/dsh-client-runtime/client').JobView[]>> }
  const snapshot = useSyncExternalStore(sessions?.list.subscribe ?? (() => () => {}), sessions?.list.getSnapshot ?? (() => emptySnapshot), sessions?.list.getSnapshot ?? (() => emptySnapshot))
  const jobs = sessionId === undefined ? [] : snapshot.jobsBySession[sessionId] ?? []
  if (jobs.length === 0) return <State loading={false} empty="No background jobs in this session." />
  return <div className={`${css.content} ${css.rows}`}>{jobs.map(job => <div className={css.row} key={job.id}>
    <span>●</span><span className={css.title}>{job.label}</span><span className={css.badge}>{job.status}</span>
  </div>)}</div>
}

export function SubagentsPanel(props: WorkbenchPanelProps) {
  const sessionId = props.scope.sessionId
  const sessions = props.sessions
  const emptySnapshot = { subagentsByParent: {} as Readonly<Record<string, import('@deepseek-ai/dsh-client-runtime/client').SubagentCatalogSnapshot>> }
  const snapshot = useSyncExternalStore(sessions?.list.subscribe ?? (() => () => {}), sessions?.list.getSnapshot ?? (() => emptySnapshot), sessions?.list.getSnapshot ?? (() => emptySnapshot))
  const catalog = sessionId === undefined ? undefined : snapshot.subagentsByParent[sessionId]
  useEffect(() => { if (sessionId !== undefined) void sessions?.refreshSubagents(sessionId) }, [sessionId, sessions])
  if (catalog?.state === "loading") return <State loading />
  if (catalog?.state === "error") return <State loading={false} error={catalog.error?.message ?? "Unable to load subagents."} />
  const entries = catalog?.entries ?? []
  if (entries.length === 0) return <State loading={false} empty="No subagents are attached to this session." />
  return <div className={`${css.content} ${css.rows}`}>{entries.map(entry => <div className={css.row} key={entry.id}><span>◆</span><span className={css.title}>{"label" in entry ? entry.label ?? entry.id : entry.id}</span><span className={css.badge}>{"activity" in entry ? entry.activity : entry.reason}</span></div>)}</div>
}
