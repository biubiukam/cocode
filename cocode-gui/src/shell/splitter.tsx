/**
 * The drag handle between two shell regions (RFC §6.3).
 *
 * Visually 1px, with an 8px hit area centred on the border. Dragging uses pointer
 * capture and rAF throttling so a fast drag cannot outrun the frame, and every
 * drag has an equivalent keyboard path (§9) — arrow keys step, Home restores.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@cocode/ui'

export type SplitterProps = {
  orientation: 'vertical' | 'horizontal'
  /** Current extent along the resized axis, in px. */
  value: number
  min: number
  max: number
  /** Which way a positive pointer delta grows the region. */
  direction: 1 | -1
  label: string
  onChange(value: number): void
  onReset(): void
  className?: string
  /** Placement supplied by the frame; the handle adds its own hit-area offset. */
  style?: React.CSSProperties
}

const KEYBOARD_STEP = 16

export function Splitter({ orientation, value, min, max, direction, label, onChange, onReset, className, style }: SplitterProps) {
  const [dragging, setDragging] = useState(false)
  const [hot, setHot] = useState(false)
  const frame = useRef<number | undefined>(undefined)
  const pending = useRef<number | undefined>(undefined)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const origin = useRef({ pointer: 0, value: 0 })

  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    if (hoverTimer.current !== undefined) clearTimeout(hoverTimer.current)
  }, [])

  const schedule = useCallback((next: number) => {
    pending.current = next
    if (frame.current !== undefined) return
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      const queued = pending.current
      if (queued !== undefined) onChange(queued)
    })
  }, [onChange])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = {
      pointer: orientation === 'vertical' ? event.clientX : event.clientY,
      value,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const pointer = orientation === 'vertical' ? event.clientX : event.clientY
    const delta = (pointer - origin.current.pointer) * direction
    schedule(Math.min(max, Math.max(min, origin.current.value + delta)))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const grow = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
    const shrink = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
    if (event.key === grow) onChange(Math.min(max, value + KEYBOARD_STEP * direction))
    else if (event.key === shrink) onChange(Math.max(min, value - KEYBOARD_STEP * direction))
    else if (event.key === 'Home') onReset()
    else return
    event.preventDefault()
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      // 200ms before highlighting: passing the cursor over a border is not intent.
      onPointerEnter={() => { hoverTimer.current = setTimeout(() => setHot(true), 200) }}
      onPointerLeave={() => {
        if (hoverTimer.current !== undefined) clearTimeout(hoverTimer.current)
        setHot(false)
      }}
      className={cn(
        'group relative z-10 shrink-0 touch-none',
        orientation === 'vertical'
          ? 'h-full w-[var(--split-handle-hit)] cursor-col-resize'
          : 'h-[var(--split-handle-hit)] w-full cursor-row-resize',
        className,
      )}
      style={{
        ...style,
        ...(orientation === 'vertical'
          ? { marginInline: 'calc(var(--split-handle-hit) / -2)' }
          : { marginBlock: 'calc(var(--split-handle-hit) / -2)' }),
      }}
    >
      <span
        aria-hidden
        className={cn(
          'absolute transition-colors duration-150',
          orientation === 'vertical' ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2',
          hot || dragging ? 'bg-accent' : 'bg-border',
        )}
      />
    </div>
  )
}
