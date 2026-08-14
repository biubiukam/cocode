import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '../lib/cn.ts'

export type SelectChoice<T extends string> = { value: T; label: string }

function SelectChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m4.5 6.25 3.5 3.5 3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SelectCheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m3.25 8.25 3.1 3.1 6.4-6.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Closes the popover on outside click and Escape. */
export function useSelectPopover() {
  const [open, setOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (shellRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return {
    open,
    setOpen,
    shellRef,
    toggle: () => setOpen(current => !current),
    close: () => setOpen(false),
  }
}

/** The design system §4.4 select listbox surface. */
export function SelectPopover({
  open,
  label,
  withHeader = false,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { open: boolean; label?: string; withHeader?: boolean }) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className={cn('select-popover', open && 'is-open', withHeader && '!gap-0 !p-0', className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** Optional caption above select options inside a popover. */
export function SelectPopoverLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-b border-border px-3 py-2', className)}>
      <span className="field-label">{children}</span>
    </div>
  )
}

/** Keeps option spacing aligned with `.select-popover` when a header is present. */
export function SelectPopoverOptions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-0.5 px-1 pb-1 pt-2', className)}>{children}</div>
}

/** One row in a select listbox; mirrors `.select-option` in the visual authority. */
export const SelectOption = forwardRef<HTMLButtonElement, Omit<ComponentProps<'button'>, 'type' | 'role'> & { selected: boolean }>(
  function SelectOption({ selected, className, children, onClick, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        role="option"
        aria-selected={selected}
        className={cn('select-option', className)}
        onClick={onClick}
        {...props}
      >
        <span className="min-w-0 truncate">{children}</span>
        <span className="select-option-check" aria-hidden>
          <SelectCheckIcon />
        </span>
      </button>
    )
  },
)

/**
 * Roving-focus wiring shared by every combobox built on `.select-popover`.
 * Owning it here keeps the keyboard contract identical across the form field and
 * the toolbar filter, which differ only in chrome.
 */
function useListbox<T extends string>({ options, value, onChange, triggerId }: {
  options: readonly SelectChoice<T>[]
  value: T
  onChange(value: T): void
  triggerId: string
}) {
  const { open, setOpen, shellRef, close } = useSelectPopover()
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex(option => option.value === value)

  const focusOption = (index: number) => {
    const length = options.length
    if (length === 0) return
    optionRefs.current[(index + length) % length]?.focus()
  }

  const pickOption = (index: number) => {
    const option = options[index]
    if (option === undefined) return
    onChange(option.value)
    close()
    document.getElementById(triggerId)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = optionRefs.current.findIndex(node => node === document.activeElement)

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && activeIndex === -1) {
      event.preventDefault()
      setOpen(true)
      focusOption(selectedIndex + (event.key === 'ArrowUp' ? -1 : 1))
      return
    }

    if (activeIndex === -1) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(activeIndex + (event.key === 'ArrowUp' ? -1 : 1))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pickOption(activeIndex)
    }
  }

  return {
    open,
    setOpen,
    shellRef,
    optionRefs,
    selected: options[selectedIndex],
    pickOption,
    onKeyDown,
  }
}

export type SelectProps<T extends string> = {
  label: string
  options: readonly SelectChoice<T>[]
  value: T
  onChange(value: T): void
  helper?: string
  className?: string
}

/** Form-field select built on the design-system listbox surface. */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  helper,
  className,
}: SelectProps<T>) {
  const triggerId = useId()
  const listboxId = useId()
  const listbox = useListbox({ options, value, onChange, triggerId })

  return (
    <div className={cn('field-stack', className)}>
      <label className="field-label" htmlFor={triggerId}>{label}</label>
      <div
        className="select-shell"
        data-select-shell
        ref={listbox.shellRef}
        onKeyDown={listbox.onKeyDown}
      >
        <select
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={event => onChange(event.target.value as T)}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={listbox.open}
          aria-controls={listboxId}
          className="select-trigger"
          onClick={() => listbox.setOpen(current => !current)}
        >
          <span className="select-trigger-value">{listbox.selected?.label ?? ''}</span>
          <span className="select-trigger-icon" aria-hidden>
            <SelectChevronIcon />
          </span>
        </button>
        <SelectPopover id={listboxId} open={listbox.open} label={label}>
          {options.map((option, index) => (
            <SelectOption
              key={option.value}
              ref={node => { listbox.optionRefs.current[index] = node }}
              selected={option.value === value}
              onClick={() => listbox.pickOption(index)}
            >
              {option.label}
            </SelectOption>
          ))}
        </SelectPopover>
      </div>
      {helper === undefined ? null : <span className="field-helper">{helper}</span>}
    </div>
  )
}

export type FilterSelectProps<T extends string> = {
  /** Accessible name only — a filter shows its current value, never a label above it. */
  label: string
  options: readonly SelectChoice<T>[]
  value: T
  onChange(value: T): void
  /** Leading glyph standing in for the label a toolbar has no room to print. */
  icon?: ReactNode
  className?: string
}

/**
 * The §4.4 combobox as a toolbar filter: the same trigger and listbox as
 * {@link Select}, minus the `.field-label` that would turn a filter bar into a
 * half-finished form.
 */
export function FilterSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  icon,
  className,
}: FilterSelectProps<T>) {
  const triggerId = useId()
  const listboxId = useId()
  const listbox = useListbox({ options, value, onChange, triggerId })

  return (
    <div
      className={cn('select-shell min-w-0', className)}
      data-select-shell
      ref={listbox.shellRef}
      onKeyDown={listbox.onKeyDown}
    >
      <select
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={event => onChange(event.target.value as T)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <button
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={listbox.open}
        aria-controls={listboxId}
        aria-label={label}
        title={label}
        className="select-trigger gap-2 text-[12px]"
        onClick={() => listbox.setOpen(current => !current)}
      >
        {icon === undefined
          ? null
          : (
              <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4" aria-hidden>
                {icon}
              </span>
            )}
        <span className="select-trigger-value flex-1">{listbox.selected?.label ?? ''}</span>
        <span className="select-trigger-icon" aria-hidden>
          <SelectChevronIcon />
        </span>
      </button>
      <SelectPopover id={listboxId} open={listbox.open} label={label}>
        {options.map((option, index) => (
          <SelectOption
            key={option.value}
            ref={node => { listbox.optionRefs.current[index] = node }}
            selected={option.value === value}
            onClick={() => listbox.pickOption(index)}
          >
            {option.label}
          </SelectOption>
        ))}
      </SelectPopover>
    </div>
  )
}
