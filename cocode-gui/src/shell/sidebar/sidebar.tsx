/**
 * The left column: global navigation over workspaces and their tasks (RFC §6.1).
 *
 * A task is a session; a group is a workspace (presented as a project). Titles
 * come from the `title` projection, so a session whose title is still being
 * generated shows a skeleton row rather than a placeholder that later rewrites
 * itself.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, PanelLeft, Plus, Search, X } from 'lucide-react'
import type { SessionSummary } from '@cocode/gui-connection'
import { Button, IconButton, Input, Tooltip } from '@cocode/ui'
import { focusZoneAttribute } from '../../runtime/index.ts'
import { SlotOutlet } from '../../boot/slot-renderer.tsx'
import { useAccount, useHost, useLayout, useLayoutActions, useOnboarding, useSessionDirectory, useSessions } from '../runtime-context.tsx'
import { AddWorkspaceDialog } from './add-workspace-dialog.tsx'
import { ProjectSectionHeader } from './project-section-header.tsx'
import { SessionRow } from './session-row.tsx'
import { SidebarAccount } from './sidebar-account.tsx'
import { useTaskListDisplay } from './use-task-list-display.ts'

type FlatSessionRow = {
  summary: SessionSummary
  projectTitle?: string
}

/** Reads the title projection out of a session summary's baseline block. */
function summaryTitle(projections: { values: Record<string, unknown> } | undefined): string | undefined {
  const raw = projections?.values['title']
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

export function Sidebar({ onOpenSettings }: { onOpenSettings(): void }) {
  const sessions = useSessions()
  const onboarding = useOnboarding()
  const host = useHost()
  const account = useAccount()
  const layoutActions = useLayoutActions()
  const centerView = useLayout(layout => layout.centerView)
  const sidebar = useLayout(layout => layout.sidebar)
  const sidebarDrawer = useLayout(layout => layout.sidebarDrawer)
  const sidebarDrawerOpen = useLayout(layout => layout.sidebarDrawerOpen)
  const sidebarOpen = sidebarDrawer ? sidebarDrawerOpen : sidebar > 0
  const directory = useSessionDirectory()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, true>>({})
  const [addingProject, setAddingProject] = useState(false)
  const [taskListDisplay, setTaskListDisplay] = useTaskListDisplay()

  const normalizedQuery = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (normalizedQuery === '') return undefined
    return (title: string | undefined, fallback: string) =>
      (title ?? fallback).toLowerCase().includes(normalizedQuery)
  }, [normalizedQuery])

  const groups = directory.groups
    .map(group => ({
      ...group,
      sessions: matches === undefined
        ? group.sessions
        : group.sessions.filter(summary => matches(summaryTitle(summary.projections), summary.sessionId)),
    }))
    .filter(group => matches === undefined || group.sessions.length > 0)

  const loose = matches === undefined
    ? directory.loose
    : directory.loose.filter(summary => matches(summaryTitle(summary.projections), summary.sessionId))

  const flatSessions = useMemo<FlatSessionRow[]>(() => {
    const rows: FlatSessionRow[] = []
    const seen = new Set<string>()
    for (const group of groups) {
      for (const summary of group.sessions) {
        rows.push({ summary, projectTitle: group.workspace.title })
        seen.add(summary.sessionId)
      }
    }
    for (const summary of loose) {
      if (seen.has(summary.sessionId)) continue
      rows.push({ summary, projectTitle: '未归类' })
    }
    rows.sort((left, right) => right.summary.updatedAt - left.summary.updatedAt)
    return rows
  }, [groups, loose])

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
  }

  const openConversation = () => layoutActions.setCenterView('conversation')

  const createSession = () => {
    openConversation()
    void sessions.createSession(directory.activeWorkspaceId)
  }

  const selectSession = (sessionId: string) => {
    openConversation()
    sessions.setActiveSession(sessionId)
  }

  const noDrag = host.window === undefined ? undefined : { WebkitAppRegion: 'no-drag' } as React.CSSProperties
  const listEmpty = groups.length === 0 && loose.length === 0

  return (
    <nav
      {...focusZoneAttribute('sidebar')}
      aria-label="任务列表"
      className="flex h-full min-h-0 flex-col border-r border-border bg-surface"
    >
      <header
        className="flex h-[var(--shell-header-height)] shrink-0 items-center gap-2 border-b border-border pl-[22px] pr-3"
        // The self-drawn title bar shares this row; the drag region is the whole
        // header minus the interactive controls on the right.
        style={{
          paddingLeft: host.window === undefined ? undefined : host.window.trafficLightInset,
          ...(host.window === undefined ? {} : { WebkitAppRegion: 'drag' } as React.CSSProperties),
        }}
      >
        {searchOpen
          ? (
              <Input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') closeSearch()
                }}
                placeholder="搜索任务"
                aria-label="搜索任务"
                className="h-8 min-w-0 flex-1 text-[12px]"
                style={noDrag}
              />
            )
          : <span className="min-w-0 flex-1 truncate text-[16px] font-extrabold tracking-[-0.02em]">COCODE</span>}
        <Tooltip content={searchOpen ? '关闭搜索' : '搜索任务'}>
          <IconButton
            size="sm"
            label={searchOpen ? '关闭搜索' : '搜索任务'}
            aria-pressed={searchOpen}
            style={noDrag}
            onClick={() => {
              if (searchOpen) closeSearch()
              else setSearchOpen(true)
            }}
          >
            {searchOpen ? <X /> : <Search />}
          </IconButton>
        </Tooltip>
        <Tooltip content="开合任务列表">
          <IconButton
            size="sm"
            label="开合任务列表"
            aria-pressed={sidebarOpen}
            style={noDrag}
            onClick={() => layoutActions.toggleSidebar()}
          >
            <PanelLeft />
          </IconButton>
        </Tooltip>
      </header>

      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
        <Button
          variant="primary"
          size="md"
          className="w-full justify-start"
          onClick={createSession}
        >
          <Plus />
          新建任务
        </Button>

        <div role="group" aria-label="管理" className="flex flex-col gap-0.5">
          <SlotOutlet name="sidebar.management" />
        </div>
      </div>

      <ProjectSectionHeader
        display={taskListDisplay}
        onDisplayChange={setTaskListDisplay}
        onAddProject={() => setAddingProject(true)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {taskListDisplay === 'grouped'
          ? (
              <>
                {groups.map(group => {
                  const isCollapsed = collapsed[group.workspace.workspaceId] === true
                  return (
                    <section key={group.workspace.workspaceId}>
                      <div className="flex min-h-[32px] items-center gap-1 px-3">
                        <button
                          type="button"
                          onClick={() => setCollapsed(state => {
                            const next = { ...state }
                            if (isCollapsed) delete next[group.workspace.workspaceId]
                            else next[group.workspace.workspaceId] = true
                            return next
                          })}
                          aria-expanded={!isCollapsed}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground"
                        >
                          {isCollapsed ? <ChevronRight className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
                          <span className="truncate">{group.workspace.title}</span>
                        </button>
                        <Tooltip content="在此项目新建任务">
                          <IconButton
                            size="xs"
                            label={`在 ${group.workspace.title} 新建任务`}
                            onClick={() => {
                              openConversation()
                              void sessions.createSession(group.workspace.workspaceId)
                            }}
                          >
                            <Plus />
                          </IconButton>
                        </Tooltip>
                      </div>
                      {isCollapsed
                        ? null
                        : group.sessions.map(summary => (
                            <SessionRow
                              key={summary.sessionId}
                              summary={summary}
                              title={summaryTitle(summary.projections)}
                              selected={summary.sessionId === directory.activeSessionId && centerView === 'conversation'}
                              onSelect={() => selectSession(summary.sessionId)}
                            />
                          ))}
                    </section>
                  )
                })}

                {loose.length > 0
                  ? (
                      <section>
                        <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">未归类</p>
                        {loose.map(summary => (
                          <SessionRow
                            key={summary.sessionId}
                            summary={summary}
                            title={summaryTitle(summary.projections)}
                            selected={summary.sessionId === directory.activeSessionId && centerView === 'conversation'}
                            onSelect={() => selectSession(summary.sessionId)}
                          />
                        ))}
                      </section>
                    )
                  : null}
              </>
            )
          : flatSessions.map(row => (
              <SessionRow
                key={row.summary.sessionId}
                summary={row.summary}
                title={summaryTitle(row.summary.projections)}
                projectTitle={row.projectTitle}
                selected={row.summary.sessionId === directory.activeSessionId && centerView === 'conversation'}
                onSelect={() => selectSession(row.summary.sessionId)}
              />
            ))}

        {listEmpty
          ? (
              <p className="px-4 py-6 text-center text-[11px] leading-[1.5] text-muted-foreground">
                {normalizedQuery === ''
                  ? '还没有项目。点击上方的 + 添加一个项目目录，Cocode 会把它的任务归到一组。'
                  : '没有匹配的任务。'}
              </p>
            )
          : null}
      </div>

      <SidebarAccount
        onOpenSettings={onOpenSettings}
        profile={account.profile}
        onSignIn={() => { void onboarding.signIn() }}
        onSignOut={() => { void onboarding.signOut() }}
      />

      <AddWorkspaceDialog open={addingProject} onOpenChange={setAddingProject} />
    </nav>
  )
}
