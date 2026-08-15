/** Optional Electron desktop sidecar origin installed before client plugins boot. */
interface DesktopRuntimeGlobal {
  __DSH_DESKTOP_RUNTIME_ORIGIN__?: string
}

/**
 * Resolve browser-owned resource URLs against the embedded DSH sidecar.
 * Ordinary `dsh web` does not define the desktop marker and keeps the
 * plugin's original same-origin relative URL behavior.
 */
export function desktopRuntimeUrl(pathname: string): string {
  const origin = (globalThis as DesktopRuntimeGlobal).__DSH_DESKTOP_RUNTIME_ORIGIN__
  return origin === undefined ? pathname : new URL(pathname, origin).href
}
