/**
 * The single keyboard listener (RFC §8).
 *
 * Bindings live on the shortcut service. This hook only forwards keydown.
 */

import { useEffect } from 'react'
import { useShortcuts } from './runtime-context.tsx'

export function useShellShortcuts(): void {
  const shortcuts = useShortcuts()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcuts.handle(event)) event.preventDefault()
    }
    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [shortcuts])
}
