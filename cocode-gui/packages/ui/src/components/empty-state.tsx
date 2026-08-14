import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  /** What is missing and why it matters. */
  description: string
  /** The single way out; §4.5 allows exactly one. */
  action?: ReactNode
  className?: string
}

/**
 * The design system §4.5 empty state. No region of the shell is ever left blank,
 * so every container without content renders this instead.
 * @param props - icon, copy, and the single escape action.
 * @returns the rendered empty state.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('empty-state', className)}>
      <span className="empty-icon" aria-hidden><Icon size={18} strokeWidth={1.5} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  )
}
