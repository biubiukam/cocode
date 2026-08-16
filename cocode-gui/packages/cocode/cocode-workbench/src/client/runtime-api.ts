interface WireSuccess<T> { readonly ok: true; readonly value: T }
interface WireFailure { readonly ok: false; readonly error?: { readonly message?: string } }

/** Workspace root of the current conversation; set during DockSurface render. */
let boundCwd: string | undefined

/**
 * Remember the listed session cwd so the first workbench requests of a page
 * load can fence against the real workspace before the host session is live.
 */
export function bindWorkbenchCwd(cwd: string | undefined): void {
  boundCwd = typeof cwd === "string" && cwd.trim() !== "" ? cwd : undefined
}

/** Listed workspace root, when the current conversation has one. */
export function workbenchCwd(): string | undefined {
  return boundCwd
}

function runtimeOrigin(): string {
  const marker = (globalThis as Record<string, unknown>).__DSH_DESKTOP_RUNTIME_ORIGIN__
  return typeof marker === "string" ? marker.replace(/\/$/, "") : ""
}

export function runtimeUrl(path: string): string {
  return `${runtimeOrigin()}${path}`
}

/** Attach the bound workspace root unless the caller already named one. */
function withCwd(payload: unknown): unknown {
  if (boundCwd === undefined || payload === null || typeof payload !== "object" || Array.isArray(payload)) return payload
  const body = payload as Record<string, unknown>
  if (typeof body.cwd === "string" && body.cwd.trim() !== "") return payload
  return { ...body, cwd: boundCwd }
}

/**
 * Absolute URL of a workspace file served by the workbench file route. It is
 * absolute even when the runtime shares the document origin, because markdown
 * image sources are only accepted as absolute http(s) URLs.
 */
export function fileUrl(sessionId: string | undefined, path: string): string {
  const params = new URLSearchParams({ path })
  if (sessionId !== undefined && sessionId !== "") params.set("sessionId", sessionId)
  if (boundCwd !== undefined) params.set("cwd", boundCwd)
  return new URL(runtimeUrl(`/cocode/workbench/file?${params.toString()}`), window.location.href).href
}

export async function workbenchRequest<T>(method: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(runtimeUrl(`/cocode/workbench/api/${encodeURIComponent(method)}`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(withCwd(payload)),
    signal,
  })
  const result = await response.json() as WireSuccess<T> | WireFailure
  if (!response.ok || !result.ok) {
    const message = !result.ok ? result.error?.message : undefined
    throw new Error(message ?? `Workbench request ${method} failed (${response.status})`)
  }
  return result.value
}

export function workbenchSocket(path: string): string {
  const url = new URL(runtimeUrl(path), window.location.href)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.href
}
