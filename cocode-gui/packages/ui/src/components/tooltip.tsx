import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export const TooltipProvider = TooltipPrimitive.Provider

/**
 * Short hover explanation. Never the only channel for an affordance's meaning —
 * every tooltip target also carries an accessible name.
 * @param props - the trigger child plus the tooltip copy.
 * @returns the rendered tooltip pair.
 */
export function Tooltip({ children, content, side = 'bottom', ...props }: {
  children: ReactNode
  content: ReactNode
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side']
}) {
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 rounded-sm border border-border bg-surface-raised px-2 py-1 text-[11px] text-foreground shadow-md',
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
