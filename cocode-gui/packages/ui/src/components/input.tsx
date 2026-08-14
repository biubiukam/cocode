import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * The design system §4.4 text field.
 * @param props - native input props.
 * @returns the rendered input element.
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('field-control', className)} {...props} />
}

/** A labelled field stack: label, control, then helper or error text. */
export function Field({ label, helper, error, children }: {
  label: string
  helper?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="field-stack">
      <span className="field-label">{label}</span>
      {children}
      {error === undefined
        ? (helper === undefined ? null : <span className="field-helper">{helper}</span>)
        : <span className="field-error">{error}</span>}
    </div>
  )
}
