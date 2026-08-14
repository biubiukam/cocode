/**
 * A sidebar navigation row (design system §3 nav-link).
 *
 * Used for management surfaces that replace the conversation column, distinct
 * from the primary action button above and the task rows below.
 */

import type { LucideIcon } from 'lucide-react'
import { Tooltip, cn } from '@cocode/ui'

export type SidebarNavLinkProps = {
  icon: LucideIcon
  label: string
  selected: boolean
  onSelect(): void
  disabled?: boolean
  disabledReason?: string
}

export function SidebarNavLink({
  icon: Icon,
  label,
  selected,
  onSelect,
  disabled = false,
  disabledReason,
}: SidebarNavLinkProps) {
  const button = (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left text-[13px] transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed text-subtle-foreground'
          : selected
            ? 'bg-secondary font-semibold text-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )

  if (!disabled || disabledReason === undefined || disabledReason === '') return button
  return (
    <Tooltip content={disabledReason} side="right">
      <span className="block">{button}</span>
    </Tooltip>
  )
}
