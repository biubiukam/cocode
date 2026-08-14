import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** The §4.1 size ladder: 24 / 28 / 32 / 40. `md` is the workbench default. */
export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<IconButtonSize, string | false> = {
  xs: 'icon-button-xs',
  sm: 'icon-button-sm',
  md: false,
  lg: 'icon-button-lg',
}

export type IconButtonProps = ComponentProps<'button'> & {
  size?: IconButtonSize
  label: string
}

/**
 * The design system §4.1 icon button. The accessible name is mandatory because
 * every icon-only affordance in the shell is also a keyboard target.
 * @param props - button props plus `size` and the required `label`.
 * @returns the rendered button element.
 */
export function IconButton({ className, size = 'md', label, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn('icon-button', SIZE_CLASS[size], className)}
      {...props}
    />
  )
}
