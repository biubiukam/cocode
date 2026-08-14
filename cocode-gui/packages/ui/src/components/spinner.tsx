import { Loader2 } from 'lucide-react'
import { cn } from '../lib/cn.ts'

/**
 * Indeterminate progress mark; §5.3 spins the running tool-card icon at 900ms linear.
 * @param props - optional class overrides.
 * @returns the rendered spinner.
 */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-accent-ink [animation-duration:900ms]', className)} aria-hidden />
}
