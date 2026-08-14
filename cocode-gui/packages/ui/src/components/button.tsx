import { Slot } from '@radix-ui/react-slot'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
/** The §4.1 size ladder: 24 / 28 / 32 / 40. `md` is the workbench default. */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

/**
 * The design system §4.1 button, rendering the authority's own `.button` classes.
 * A new treatment is a new variant in `design-system.html`, never a class at a
 * call site.
 * @param props - button props plus `variant` / `size` / `asChild`.
 * @returns the rendered button element.
 */
export function Button({ className, variant = 'secondary', size = 'md', asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      className={cn('button', `button-${variant}`, size !== 'md' && `button-${size}`, className)}
      {...props}
    />
  )
}
