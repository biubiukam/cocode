interface DesktopRuntimeGlobal {
  readonly __DSH_DESKTOP_RUNTIME_ORIGIN__?: string
}

export function desktopRuntimeUrl(pathname: string): string {
  const origin = (globalThis as DesktopRuntimeGlobal).__DSH_DESKTOP_RUNTIME_ORIGIN__
  return origin === undefined ? pathname : new URL(pathname, origin).href
}

