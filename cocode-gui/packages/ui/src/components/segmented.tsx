import { cn } from '../lib/cn.ts'

export type SegmentedOption<T extends string> = { value: T; label: string }

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange(value: T): void
  label: string
  className?: string
}

/**
 * The design system §4.3 segmented control, for mutually exclusive views.
 * @param props - options, current value, change callback, and the group's accessible name.
 * @returns the rendered segmented control.
 */
export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('segmented', className)}>
      {options.map(option => (
        <button
          key={option.value}
          role="tab"
          type="button"
          className="segment whitespace-nowrap"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
