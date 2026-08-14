import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * The design system §4.5 skeleton: a `--secondary` block with a sweeping highlight.
 * @param props - div props; callers set the block's own width and height.
 * @returns the rendered placeholder element.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skeleton', className)} {...props} />
}

/** Stacked text lines for a loading row; the last line is short, per §4.5. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('skeleton-stack', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'skeleton-line short' : 'skeleton-line'} />
      ))}
    </div>
  )
}
