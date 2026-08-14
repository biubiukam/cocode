/**
 * Preview dirty-tab guards. Layout `closeTab` consults this map by instanceKey
 * so unsaved editors can confirm before the tab disappears.
 */

type Guard = {
  isDirty(): boolean
  /** Returns true if the tab may close. */
  confirmClose(): boolean
}

const guards = new Map<string, Guard>()

export function registerDirtyGuard(instanceKey: string, guard: Guard): () => void {
  guards.set(instanceKey, guard)
  return () => {
    if (guards.get(instanceKey) === guard) guards.delete(instanceKey)
  }
}

/** Returns false when the user cancelled discarding unsaved changes. */
export function confirmClosePreview(instanceKey: string): boolean {
  const guard = guards.get(instanceKey)
  if (guard === undefined || !guard.isDirty()) return true
  return guard.confirmClose()
}
