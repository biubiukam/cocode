/**
 * Cross-panel Composer draft channel (Dock Files `@` / Preview selection).
 *
 * The Composer mounts a sink; callers append fragments without holding a React ref.
 */

export type DraftSink = {
  append(fragment: string): void
  fill(text: string): void
}

let sink: DraftSink | undefined
const pending: string[] = []

/** Called by Composer on mount; returns disposer. */
export function registerDraftSink(next: DraftSink): () => void {
  sink = next
  if (pending.length > 0) {
    const batch = pending.splice(0).join('')
    if (batch !== '') next.append(batch)
  }
  return () => {
    if (sink === next) sink = undefined
  }
}

/** Append text into the active Composer draft (queues if Composer is unmounted). */
export function appendComposerDraft(fragment: string): void {
  if (fragment === '') return
  if (sink === undefined) {
    pending.push(fragment)
    return
  }
  sink.append(fragment)
}

/** Replace the Composer draft (welcome suggestions / explicit fill). */
export function fillComposerDraft(text: string): void {
  pending.length = 0
  if (sink === undefined) {
    if (text !== '') pending.push(text)
    return
  }
  sink.fill(text)
}
