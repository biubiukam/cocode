/**
 * Change publication for the runtime's observable objects.
 *
 * Streaming events arrive per token, so notifying per change would drive one
 * React render per chunk. `markDirty` coalesces into a single microtask; only a
 * direct echo of a user gesture uses `notifyNow` (RFC §4.5, §4.8).
 */

/** How urgently a change must reach the screen. */
export type Publication =
  /** Nothing observable changed; do not notify. */
  | 'none'
  /** Structural change; coalesce into the next microtask. */
  | 'immediate'
  /** Visible streaming progress; coalesce into the next animation frame. */
  | 'frame'

export class Notifier {
  private readonly listeners = new Set<() => void>()
  private scheduled: 'none' | 'microtask' | 'frame' = 'none'
  private handle: number | undefined

  /** Subscribes to change notifications; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Publishes according to the change's urgency. */
  publish(publication: Publication): void {
    if (publication === 'none') return
    if (publication === 'frame') this.markFrameDirty()
    else this.markDirty()
  }

  /**
   * Coalesces this change with any others in the same microtask.
   * A microtask already pending wins over a frame: a structural change must not
   * be delayed to the next paint because a token arrived first.
   */
  markDirty(): void {
    if (this.scheduled === 'microtask') return
    this.cancelScheduled()
    this.scheduled = 'microtask'
    queueMicrotask(() => {
      if (this.scheduled !== 'microtask') return
      this.scheduled = 'none'
      this.emit()
    })
  }

  /**
   * Coalesces this change into the next animation frame.
   *
   * Microtask batching does not bound renders per frame — a stream that yields
   * a token per microtask checkpoint would still render dozens of times between
   * paints. Streaming deltas take this path so the screen updates once per frame
   * no matter how fast the tokens arrive.
   */
  markFrameDirty(): void {
    if (this.scheduled !== 'none') return
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      this.markDirty()
      return
    }
    this.scheduled = 'frame'
    this.handle = globalThis.requestAnimationFrame(() => {
      this.handle = undefined
      if (this.scheduled !== 'frame') return
      this.scheduled = 'none'
      this.emit()
    })
  }

  /** Publishes synchronously. Reserved for the direct echo of a user gesture. */
  notifyNow(): void {
    this.cancelScheduled()
    this.scheduled = 'none'
    this.emit()
  }

  private cancelScheduled(): void {
    if (this.handle === undefined) return
    globalThis.cancelAnimationFrame(this.handle)
    this.handle = undefined
  }

  private emit(): void {
    // Copy first: a listener may unsubscribe while the set is being walked.
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * A value published to `useSyncExternalStore`. The snapshot reference is stable
 * until `set` replaces it, which is what keeps React from re-rendering on every read.
 */
export class Observable<T> {
  private current: T
  private readonly notifier = new Notifier()

  constructor(initial: T) {
    this.current = initial
  }

  get(): T {
    return this.current
  }

  /** Replaces the snapshot and schedules a coalesced notification. */
  set(next: T): void {
    if (Object.is(next, this.current)) return
    this.current = next
    this.notifier.markDirty()
  }

  /** Replaces the snapshot and notifies synchronously. */
  setNow(next: T): void {
    if (Object.is(next, this.current)) return
    this.current = next
    this.notifier.notifyNow()
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener)
  }
}
