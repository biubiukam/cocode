import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** Semantic tones the design system §4.2 defines, named by meaning not colour. */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<BadgeTone, string | false> = {
  neutral: false,
  accent: 'badge-blue',
  success: 'badge-green',
  warning: 'badge-yellow',
  danger: 'badge-red',
}

export type BadgeProps = ComponentProps<'span'> & { tone?: BadgeTone }

/**
 * The design system §4.2 status badge.
 * @param props - span props plus the semantic `tone`.
 * @returns the rendered badge element.
 */
export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return <span className={cn('badge', TONE_CLASS[tone], className)} {...props} />
}
