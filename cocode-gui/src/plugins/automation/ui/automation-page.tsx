/**
 * Automation management page: Schedule | Jobs | Workflow segments.
 *
 * Layout follows the center-surface contract: header, then a full-bleed toolbar
 * whose inner row shares the content column so both gutters line up, then one
 * scroll region. Everything the three segments differ by lives in SEGMENT_META,
 * which is what keeps the body a flat sequence of guards.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, FolderTree, ListTodo, MessageSquare, Plus, Timer, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, EmptyState, FilterSelect, Segmented, Skeleton } from '@cocode/ui'
import type { HostCapabilities, SessionId, WorkspaceId } from '@cocode/gui-connection'
import { focusZoneAttribute } from '../../../runtime/index.ts'
import {
  useAutomation,
  useAutomationSnapshot,
  useLayout,
  useLayoutActions,
  useSessionDirectory,
  useSessions,
} from '../../../shell/runtime-context.tsx'
import { CenterHeader } from '../../../shell/center/center-header.tsx'
import { useToast } from '../../../shell/overlay/toast.tsx'
import type { AutomationSegment, AutomationSessionFilter, AutomationSnapshot } from '../store/types.ts'
import { ListPanel } from './list.tsx'
import { ScheduleList } from './schedule-list.tsx'
import { ScheduleCreateDialog } from './schedule-create-dialog.tsx'
import { JobsList } from './jobs-list.tsx'
import { WorkflowList } from './workflow-list.tsx'

const SEGMENTS = [
  { value: 'schedules', label: '定时' },
  { value: 'jobs', label: '任务' },
  { value: 'workflows', label: '工作流' },
] as const satisfies readonly { value: AutomationSegment; label: string }[]

const CAPABILITY_HINT = '这是能力未组装，不是「没有数据」。换用启用了对应插件的 harness 后再试。'

type SegmentMeta = {
  icon: LucideIcon
  capability: keyof HostCapabilities
  panelTitle: string
  offTitle: string
  emptyTitle: string
  emptyDescription: string
}

const SEGMENT_META: Record<AutomationSegment, SegmentMeta> = {
  schedules: {
    icon: Timer,
    capability: 'schedule',
    panelTitle: '定时提醒',
    offTitle: '当前部署未启用定时',
    emptyTitle: '还没有定时提醒',
    emptyDescription: '新建一条提醒，或让 Agent 使用 schedule 工具创建。到期后会推进对应会话。',
  },
  jobs: {
    icon: ListTodo,
    capability: 'jobs',
    panelTitle: '后台任务',
    offTitle: '当前部署未启用后台任务',
    emptyTitle: '当前没有后台任务',
    emptyDescription: 'Agent 启动长时间命令或子代理时会出现在这里。Dock 的 Jobs 面板显示同一数据源的当前会话视图。',
  },
  workflows: {
    icon: Workflow,
    capability: 'workflow',
    panelTitle: '工作流运行',
    offTitle: '当前部署未启用工作流',
    emptyTitle: '还没有工作流运行记录',
    emptyDescription: '工作流由模型通过 workflow 工具启动。这里只管理运行记录与取消，不能新建定义。',
  },
}

function segmentCount(snapshot: AutomationSnapshot): number {
  if (snapshot.segment === 'schedules') return snapshot.schedules.length
  if (snapshot.segment === 'jobs') return snapshot.jobs.length
  return snapshot.workflows.length
}

/** §4.5 skeleton: the first directory read gets placeholders, refreshes stay silent. */
function LoadingRows() {
  return (
    <div className="skeleton-stack" aria-busy>
      <Skeleton className="h-[62px]" />
      <Skeleton className="h-[62px]" />
      <Skeleton className="h-[62px]" />
    </div>
  )
}

export function AutomationPage() {
  const automation = useAutomation()
  const snap = useAutomationSnapshot()
  const directory = useSessionDirectory()
  const sessions = useSessions()
  const toast = useToast()
  const actions = useLayoutActions()
  const sidebar = useLayout(layout => layout.sidebar)
  const sidebarDrawerOpen = useLayout(layout => layout.sidebarDrawerOpen)
  const sidebarDrawer = useLayout(layout => layout.sidebarDrawer)
  const rightSize = useLayout(layout => layout.right.size)
  const bottomSize = useLayout(layout => layout.bottom.size)
  const [createOpen, setCreateOpen] = useState(false)

  const sidebarOpen = sidebarDrawer ? sidebarDrawerOpen : sidebar > 0
  const showSidebarToggleInCenter = sidebarDrawer ? !sidebarDrawerOpen : sidebar === 0

  useEffect(() => {
    if (!snap.pendingCreate) return
    setCreateOpen(true)
    automation.acknowledgeCreateRequest()
  }, [snap.pendingCreate, automation])

  const workspaceOptions = useMemo(() => {
    const options: { value: WorkspaceId | 'all'; label: string }[] = [{ value: 'all', label: '全部工作区' }]
    for (const group of directory.groups) {
      options.push({ value: group.workspace.workspaceId, label: group.workspace.title || group.workspace.path })
    }
    return options
  }, [directory.groups])

  const sessionOptions = useMemo(() => {
    const options: { value: AutomationSessionFilter; label: string }[] = [
      { value: 'all', label: '全部会话' },
      { value: 'active', label: '当前会话' },
    ]
    const summaries = snap.workspaceFilter === 'all'
      ? sessions.listVisibleSummaries()
      : (directory.groups.find(g => g.workspace.workspaceId === snap.workspaceFilter)?.sessions ?? [])
    for (const summary of summaries) {
      const title = sessions.session(summary.sessionId).getSnapshot().title
      options.push({
        value: summary.sessionId,
        label: title?.trim() || summary.cwd || summary.sessionId.slice(0, 8),
      })
    }
    return options
  }, [directory.groups, sessions, snap.workspaceFilter])

  const openSession = (sessionId: SessionId) => {
    sessions.setActiveSession(sessionId)
    actions.setCenterView('conversation')
  }

  const sessionLabel = (sessionId: SessionId) => {
    const snapshot = sessions.session(sessionId).getSnapshot()
    return snapshot.title?.trim() || snapshot.cwd || sessionId.slice(0, 8)
  }

  const meta = SEGMENT_META[snap.segment]
  const capabilityOff = snap.capabilities[meta.capability] === false
  const count = segmentCount(snap)
  const canCreate = snap.capabilities.schedule !== false

  const renderList = () => {
    if (snap.segment === 'schedules') {
      return (
        <ScheduleList
          rows={snap.schedules}
          sessionLabel={sessionLabel}
          onOpenSession={openSession}
          onCopy={(row) => {
            automation.requestCopy(row)
            setCreateOpen(true)
          }}
          onDeleted={async (row) => {
            const error = await automation.deleteSchedule(row.sessionId, row.id)
            if (error !== undefined) toast.push('warning', error)
            else toast.push('success', '已删除定时提醒')
          }}
        />
      )
    }
    if (snap.segment === 'jobs') {
      return (
        <JobsList
          rows={snap.jobs}
          canMutate={automation.canMutateJobs()}
          sessionLabel={sessionLabel}
          onOpenSession={openSession}
          onKill={async (row) => {
            const error = await automation.killJob(row.sessionId, row.id)
            if (error !== undefined) toast.push('warning', error)
          }}
          onOutput={async (row) => automation.readJobOutput(row.sessionId, row.id)}
        />
      )
    }
    return (
      <WorkflowList
        rows={snap.workflows}
        canCancel={automation.canCancelWorkflows()}
        sessionLabel={sessionLabel}
        onOpenSession={openSession}
        onCancel={async (row) => {
          const error = await automation.cancelWorkflow(row.sessionId, row.runId)
          if (error !== undefined) toast.push('warning', error)
          else toast.push('success', '已请求取消工作流')
        }}
      />
    )
  }

  const renderBody = () => {
    if (capabilityOff) {
      return <EmptyState icon={meta.icon} title={meta.offTitle} description={CAPABILITY_HINT} />
    }
    if (snap.loading && count === 0) return <LoadingRows />
    if (count === 0) {
      return (
        <EmptyState
          icon={meta.icon}
          title={meta.emptyTitle}
          description={meta.emptyDescription}
          action={snap.segment === 'schedules'
            ? (
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  新建定时任务
                </Button>
              )
            : undefined}
        />
      )
    }
    return (
      <ListPanel title={meta.panelTitle} count={count}>
        {renderList()}
      </ListPanel>
    )
  }

  return (
    <section
      {...focusZoneAttribute('conversation')}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
    >
      <CenterHeader
        title="自动化"
        showSidebarToggle={showSidebarToggleInCenter}
        sidebarOpen={sidebarOpen}
        rightOpen={rightSize > 0}
        bottomOpen={bottomSize > 0}
        onToggleSidebar={actions.toggleSidebar}
        onToggleRight={() => actions.toggleDock('right')}
        onToggleBottom={() => actions.toggleDock('bottom')}
      />

      {snap.error === undefined
        ? null
        : (
            <div className="flex shrink-0 items-start gap-2 border-b border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-danger-soft px-6 py-2 text-[11px] text-danger">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{snap.error}</span>
            </div>
          )}

      <div className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-[960px] items-center gap-3 px-6 py-2">
          {/* The segment switch and the primary action hold their size; a narrow
              center column takes width from the filters, whose trigger already
              ellipsises its value. */}
          <Segmented
            className="shrink-0"
            options={SEGMENTS}
            value={snap.segment}
            onChange={value => automation.setSegment(value)}
            label="自动化分段"
          />
          <FilterSelect
            icon={<FolderTree />}
            label="工作区"
            className="min-w-[96px] flex-1 basis-0 max-w-[200px]"
            options={workspaceOptions}
            value={snap.workspaceFilter}
            onChange={value => automation.setWorkspaceFilter(value)}
          />
          <FilterSelect
            icon={<MessageSquare />}
            label="会话"
            className="min-w-[96px] flex-1 basis-0 max-w-[200px]"
            options={sessionOptions}
            value={snap.sessionFilter}
            onChange={value => automation.setSessionFilter(value)}
          />
          {snap.segment === 'schedules' && canCreate
            ? (
                <Button size="lg" variant="primary" className="ml-auto shrink-0" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  新建定时
                </Button>
              )
            : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] px-6 py-5">
          {renderBody()}
        </div>
      </div>

      <ScheduleCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => toast.push('success', '已创建定时提醒')}
      />
    </section>
  )
}
