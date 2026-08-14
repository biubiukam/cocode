/**
 * Shared shell for sidebar management surfaces (automation, plugins, …).
 */

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@cocode/ui'
import { focusZoneAttribute } from '../../runtime/index.ts'
import { useLayout, useLayoutActions } from '../runtime-context.tsx'
import { CenterHeader } from './center-header.tsx'

export type ManagementPageProps = {
  title: string
  icon: LucideIcon
  emptyTitle: string
  emptyDescription: string
  action?: ReactNode
}

export function ManagementPage({ title, icon, emptyTitle, emptyDescription, action }: ManagementPageProps) {
  const actions = useLayoutActions()
  const sidebar = useLayout(layout => layout.sidebar)
  const sidebarDrawerOpen = useLayout(layout => layout.sidebarDrawerOpen)
  const sidebarDrawer = useLayout(layout => layout.sidebarDrawer)
  const rightSize = useLayout(layout => layout.right.size)
  const bottomSize = useLayout(layout => layout.bottom.size)

  const sidebarOpen = sidebarDrawer ? sidebarDrawerOpen : sidebar > 0
  const showSidebarToggleInCenter = sidebarDrawer ? !sidebarDrawerOpen : sidebar === 0

  return (
    <section
      {...focusZoneAttribute('conversation')}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
    >
      <CenterHeader
        title={title}
        showSidebarToggle={showSidebarToggleInCenter}
        sidebarOpen={sidebarOpen}
        rightOpen={rightSize > 0}
        bottomOpen={bottomSize > 0}
        onToggleSidebar={actions.toggleSidebar}
        onToggleRight={() => actions.toggleDock('right')}
        onToggleBottom={() => actions.toggleDock('bottom')}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-8">
        <div className="mx-auto w-full max-w-[640px]">
          <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} action={action} />
        </div>
      </div>
    </section>
  )
}
