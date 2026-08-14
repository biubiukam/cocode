/**
 * Jobs: session background tasks — metrics, output, confirm-kill, subagents
 * (RFC dock-panel-depth §3.4).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ListChecks, Square, Terminal } from 'lucide-react'
import { Badge, Button, EmptyState, Skeleton, cn } from '@cocode/ui'
import type { JobView, SessionId, SubagentListEntry } from '@cocode/gui-connection'
import { definePanel, type PanelProps } from '../types.ts'
import {
  useActiveSession,
  useConnectionService,
  useLayoutActions,
  useSessionSnapshot,
  useSessions,
} from '../../shell/runtime-context.tsx'
import { getDockPrefs, subscribeDockPrefs } from '../../runtime/prefs/dock-prefs.ts'
import { useToast } from '../../shell/overlay/toast.tsx'

const STATUS_TONE: Record<JobView['status'], 'accent' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  running: 'accent',
  stopping: 'warning',
  completed: 'success',
  killed: 'neutral',
  failed: 'danger',
}

const STATUS_LABEL: Record<JobView['status'], string> = {
  running: '运行中',
  stopping: '停止中',
  completed: '已完成',
  killed: '已终止',
  failed: '失败',
}

function formatDuration(job: JobView): string {
  const end = job.finishedAt ?? Date.now()
  const seconds = Math.max(0, Math.round((end - job.startedAt) / 1000))
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)}m ${String(seconds % 60)}s`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-surface-sunken p-[9px]">
      <p className="font-mono text-[13px] tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
    </div>
  )
}

function JobsPanel({ sizeClass }: PanelProps) {
  const session = useActiveSession()
  const snapshot = useSessionSnapshot(session)
  const connectionService = useConnectionService()
  const layoutActions = useLayoutActions()
  const sessions = useSessions()
  const toast = useToast()

  const jobs = useMemo(() => snapshot?.jobs ?? [], [snapshot])
  const running = jobs.filter(job => job.status === 'running').length
  const failed = jobs.filter(job => job.status === 'failed').length

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [outputText, setOutputText] = useState<string | undefined>(undefined)
  const [outputLoading, setOutputLoading] = useState(false)
  const [pendingKill, setPendingKill] = useState<string | undefined>(undefined)
  const [busyId, setBusyId] = useState<string | undefined>(undefined)
  const [subagents, setSubagents] = useState<SubagentListEntry[]>([])
  const [subagentsLoading, setSubagentsLoading] = useState(false)
  const [autoOpenJobs, setAutoOpenJobs] = useState(() => getDockPrefs().autoOpenJobs)

  const outputRef = useRef<HTMLPreElement>(null)
  const prevJobCount = useRef(jobs.length)

  // Prefer prefs while mounted; auto-open Jobs when count rises.
  useEffect(() => subscribeDockPrefs(() => {
    setAutoOpenJobs(getDockPrefs().autoOpenJobs)
  }), [])

  useEffect(() => {
    const previous = prevJobCount.current
    prevJobCount.current = jobs.length
    if (!autoOpenJobs) return
    if (jobs.length > previous) {
      layoutActions.openPanel('jobs', { focus: false })
    }
  }, [jobs.length, autoOpenJobs, layoutActions])

  // Drop selection when the job disappears from the snapshot.
  useEffect(() => {
    if (selectedId === undefined) return
    if (jobs.some(job => job.id === selectedId)) return
    setSelectedId(undefined)
    setOutputText(undefined)
    setPendingKill(undefined)
  }, [jobs, selectedId])

  useEffect(() => {
    if (pendingKill === undefined) return
    const timer = window.setTimeout(() => setPendingKill(undefined), 4000)
    return () => window.clearTimeout(timer)
  }, [pendingKill])

  // Keep output pre scrolled to the bottom.
  useEffect(() => {
    const node = outputRef.current
    if (node === null) return
    node.scrollTop = node.scrollHeight
  }, [outputText])

  useEffect(() => {
    const sessionId = session?.sessionId
    if (sessionId === undefined) {
      setSubagents([])
      return
    }
    const transport = connectionService.activeTransport
    if (transport === undefined) return
    const controller = new AbortController()
    setSubagentsLoading(true)
    void transport.call('subagent.list', { parentSessionId: sessionId }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setSubagents(result.value.entries)
          return
        }
        setSubagents([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setSubagentsLoading(false)
      })
    return () => controller.abort()
  }, [session?.sessionId, connectionService.activeTransport, snapshot?.updatedAt])

  async function loadOutput(jobId: string): Promise<void> {
    const sessionId = session?.sessionId
    const transport = connectionService.activeTransport
    if (sessionId === undefined || transport === undefined) return
    setSelectedId(jobId)
    setOutputLoading(true)
    setPendingKill(undefined)
    const result = await transport.call('job.output', { sessionId, jobId })
    setOutputLoading(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      setOutputText(undefined)
      return
    }
    setOutputText(result.value.text || '（无输出）')
  }

  async function killJob(job: JobView): Promise<void> {
    const sessionId = session?.sessionId
    const transport = connectionService.activeTransport
    if (sessionId === undefined || transport === undefined) return
    if (pendingKill !== job.id) {
      setPendingKill(job.id)
      return
    }
    setBusyId(job.id)
    setPendingKill(undefined)
    const result = await transport.call('job.kill', { sessionId, jobId: job.id })
    setBusyId(undefined)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      return
    }
    toast.push('success', '已请求停止')
  }

  function openSubagent(id: SessionId): void {
    layoutActions.setCenterView('conversation')
    sessions.setActiveSession(id)
  }

  if (snapshot === undefined) {
    return <EmptyState icon={ListChecks} title="没有选中的任务" description="选择一个任务后，它的后台作业会显示在这里。" className="m-4" />
  }

  const selected = jobs.find(job => job.id === selectedId)
  const childEntries = subagents.filter((entry): entry is Extract<SubagentListEntry, { kind: 'child' }> => entry.kind === 'child')

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      <div className={cn('grid shrink-0 gap-2', sizeClass === 'compact' ? 'grid-cols-2' : 'grid-cols-4')}>
        <Metric label="总数" value={String(jobs.length)} />
        <Metric label="运行中" value={String(running)} />
        <Metric label="失败" value={String(failed)} />
        <Metric label="队列" value={String(snapshot.queue.length)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {jobs.length === 0
          ? (
              <EmptyState
                icon={ListChecks}
                title="没有后台作业"
                description="Agent 启动长时间运行的命令或子代理时，它们会出现在这里，并可在此查看状态。"
              />
            )
          : (
              <ul className="flex flex-col">
                {jobs.map(job => {
                  const killable = job.status === 'running' || job.status === 'stopping'
                  const confirming = pendingKill === job.id
                  return (
                    <li
                      key={job.id}
                      className={cn(
                        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-2 last:border-b-0',
                        selectedId === job.id && 'bg-surface-sunken',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => {
                          void loadOutput(job.id)
                        }}
                      >
                        <p className="truncate text-[12px] font-semibold text-foreground">{job.label}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {job.kind}
                          {job.detail === undefined ? '' : ` · ${job.detail}`}
                        </p>
                      </button>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <span className="font-mono text-[10px] tabular-nums text-subtle-foreground">{formatDuration(job)}</span>
                        <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busyId === job.id || outputLoading}
                          onClick={() => {
                            void loadOutput(job.id)
                          }}
                        >
                          <Terminal />
                          查看输出
                        </Button>
                        {killable
                          ? (
                              <Button
                                size="xs"
                                variant={confirming ? 'primary' : 'ghost'}
                                disabled={busyId === job.id}
                                onClick={() => {
                                  void killJob(job)
                                }}
                              >
                                <Square />
                                {confirming ? '再点确认' : '停止'}
                              </Button>
                            )
                          : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

        <section className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center gap-2">
            <Bot className="size-3.5 text-muted-foreground" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">子代理</h3>
          </div>
          {subagentsLoading && childEntries.length === 0
            ? <Skeleton className="h-8 w-full" />
            : childEntries.length === 0
              ? <p className="px-1 py-2 text-[11px] text-muted-foreground">当前会话没有子代理。</p>
              : (
                  <ul className="flex flex-col">
                    {childEntries.map(entry => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-sunken"
                          onClick={() => openSubagent(entry.id)}
                        >
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
                            {entry.label ?? entry.id}
                          </span>
                          <Badge tone={entry.activity === 'running' ? 'accent' : 'neutral'}>
                            {entry.activity === 'running' ? '运行中' : '空闲'}
                          </Badge>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {entry.mode === 'one-shot' ? '一次性' : '可续聊'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
        </section>
      </div>

      <div className="flex min-h-[120px] shrink-0 flex-col overflow-hidden rounded-md border border-border bg-surface-sunken">
        <div className="flex min-h-[32px] shrink-0 items-center gap-2 border-b border-border px-3">
          <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {selected === undefined ? '选择作业查看输出' : selected.label}
          </span>
        </div>
        {outputLoading
          ? <Skeleton className="m-3 h-16" />
          : (
              <pre
                ref={outputRef}
                className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-[1.45] text-foreground whitespace-pre-wrap"
              >
                {outputText ?? ''}
              </pre>
            )}
      </div>
    </div>
  )
}

export const jobsPanel = definePanel<void>({
  id: 'jobs',
  title: '作业',
  icon: ListChecks,
  scope: 'session',
  multiInstance: false,
  preferredDock: 'bottom',
  render: props => <JobsPanel {...props} />,
})
