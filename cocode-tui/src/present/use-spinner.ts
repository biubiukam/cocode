import { useRef, useSyncExternalStore } from 'react'

/**
 * Shared animation clock.
 *
 * The design system runs a tool spinner at 900ms per rotation (§7). In a
 * terminal every frame is a full repaint, so a faster cadence shows up as
 * flicker over SSH or a multiplexer. One clock for the whole tree also keeps
 * concurrent spinners in phase and keeps the repaint rate independent of how
 * many rows happen to be streaming.
 */
export const SPINNER_PERIOD_MS = 900

const FRAMES_PER_PERIOD = 4
const TICK_MS = SPINNER_PERIOD_MS / FRAMES_PER_PERIOD

let tick = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === undefined) {
    timer = setInterval(() => {
      tick += 1
      for (const notify of listeners) notify()
    }, TICK_MS)
    // The clock must never hold the process open on its own.
    timer.unref?.()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

function getTick(): number {
  return tick
}

const idleSubscribe = () => () => {}
const idleTick = () => 0

/**
 * Counts ticks since this animation became active, not since the clock started,
 * so an animation always opens on its first frame no matter how long the
 * process has been running.
 */
export function useAnimationTick(active: boolean): number {
  const tick = useSyncExternalStore(active ? subscribe : idleSubscribe, active ? getTick : idleTick)
  const origin = useRef(0)
  const wasActive = useRef(false)
  if (active && !wasActive.current) origin.current = tick
  wasActive.current = active
  return active ? tick - origin.current : 0
}

/** Resting state is the first frame, so a stopped spinner still reads as a mark. */
export function useSpinnerFrame(frames: readonly string[], active: boolean): string {
  const frame = useAnimationTick(active && frames.length > 1)
  return frames[frame % frames.length] ?? frames[0] ?? ''
}
