import { Puzzle, Zap } from 'lucide-react'
import { isLoopbackOrigin } from '../../host/bridge.ts'
import { useConnection, useLayout, useLayoutActions } from '../runtime-context.tsx'
import { SidebarNavLink } from './sidebar-nav-link.tsx'

const ICONS = { zap: Zap, puzzle: Puzzle } as const

export function ManagementLink(props: {
  view: string
  label: string
  icon: keyof typeof ICONS
  loopbackOnly?: boolean
}) {
  const connection = useConnection()
  const centerView = useLayout(layout => layout.centerView)
  const actions = useLayoutActions()
  const privileged = isLoopbackOrigin(connection.baseUrl)
  const disabled = props.loopbackOnly === true && !privileged
  const Icon = ICONS[props.icon] ?? Zap
  return (
    <SidebarNavLink
      icon={Icon}
      label={props.label}
      selected={centerView === props.view}
      disabled={disabled}
      disabledReason={disabled ? '需要本机连接 harness 才能管理插件。' : undefined}
      onSelect={() => actions.setCenterView(props.view)}
    />
  )
}
