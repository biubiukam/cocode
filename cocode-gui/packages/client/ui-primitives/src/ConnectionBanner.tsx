// ConnectionBanner: top strip surfacing connection loss. The atom is pure:
// the owner subscribes to connection state and passes `reconnecting` down.
// A null/connecting state upstream should stay quiet too — only an actual
// outage (reconnect backoff in progress) shows the strip.

import css from './ConnectionBanner.module.css'

/**
 * Render the reconnecting banner.
 * @param props.reconnecting - true while the connection is in backoff/retry.
 * @param props.label - banner text; the owner passes localized copy (this
 * package is cordis-free, so copy arrives via props).
 * @returns the banner, or null when connected.
 */
export function ConnectionBanner({ reconnecting, label }: {
  reconnecting: boolean
  label?: string | undefined
}) {
  if (!reconnecting) return null
  const chinese = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('zh')
  return <div className={css.banner}>{label ?? (chinese ? '连接已断开，正在重连…' : 'Connection lost. Reconnecting…')}</div>
}
