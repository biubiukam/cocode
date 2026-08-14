import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * The design system §4.5 toast. Position is fixed by the class; the caller only
 * supplies the copy and the dismiss control.
 * @param props - div props; `role="status"` and the live region are set here.
 * @returns the rendered toast element.
 */
export function Toast({ className, ...props }: ComponentProps<'div'>) {
  return <div role="status" aria-live="polite" className={cn('toast is-visible', className)} {...props} />
}
