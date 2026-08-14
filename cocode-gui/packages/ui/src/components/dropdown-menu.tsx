import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export const DropdownMenuSeparator = () => (
  <div role="separator" className="mx-1.5 my-1 h-px bg-border" />
)

/** Groups rows inside `.menu-popover` (design system §4.7 `.menu-group`). */
export function DropdownMenuGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('border-b border-border p-1.5 last:border-b-0', className)}>
      {children}
    </div>
  )
}

/** Floating menu surface (design system §4.7 `.menu-popover`). */
export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-0 overflow-hidden rounded-[var(--radius)] border border-border bg-surface-raised shadow-md',
          'w-[min(100%,280px)]',
          className,
        )}
        style={{ maxHeight: 'min(390px, 62vh)', overflowY: 'auto' }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  icon?: ReactNode
  /** Trailing shortcut hint. */
  hint?: string
  danger?: boolean
}

/** One menu row (design system §4.7 `.menu-item`). */
export function DropdownMenuItem({ className, icon, hint, danger = false, children, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex min-h-[34px] w-full cursor-pointer items-center gap-[9px] rounded-md px-2 text-left text-[11px] text-foreground outline-none transition-[background-color,color,transform] duration-150',
        'data-[highlighted]:bg-secondary data-[highlighted]:translate-x-0.5',
        'focus-visible:bg-secondary',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        danger && 'text-danger',
        className,
      )}
      {...props}
    >
      {icon === undefined
        ? null
        : (
            <span
              className={cn(
                'grid size-[18px] shrink-0 place-items-center text-muted-foreground [&_svg]:block [&_svg]:size-3.5',
                danger && 'text-danger',
              )}
              aria-hidden
            >
              {icon}
            </span>
          )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint === undefined ? null : (
        <kbd className="min-w-[42px] rounded-[4px] border border-border bg-surface-sunken px-1.5 py-px text-center font-mono text-[10px] text-muted-foreground">
          {hint}
        </kbd>
      )}
    </DropdownMenuPrimitive.Item>
  )
}
