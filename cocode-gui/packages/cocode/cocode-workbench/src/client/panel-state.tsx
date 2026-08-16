import { useEffect, useState } from "react"
import css from "./panel-state.module.css"

/** Normalize anything thrown by a request into displayable text. */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One-shot remote read shared by every panel: the request restarts whenever
 * `keys` change and is aborted on unmount, so a fast target switch cannot let
 * a stale response overwrite the current one.
 */
export function useRemote<T>(load: (signal: AbortSignal) => Promise<T>, keys: readonly unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true })
    void load(controller.signal).then(
      value => setState({ value, loading: false }),
      error => { if (!controller.signal.aborted) setState({ error: message(error), loading: false }) },
    )
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, keys)
  return state
}

export function State(props: { loading: boolean; error?: string; empty?: string }) {
  if (props.loading) return <div className={css.state}>Loading…</div>
  if (props.error !== undefined) return <div className={`${css.state} ${css.error}`}>{props.error}</div>
  if (props.empty !== undefined) return <div className={css.state}>{props.empty}</div>
  return null
}
