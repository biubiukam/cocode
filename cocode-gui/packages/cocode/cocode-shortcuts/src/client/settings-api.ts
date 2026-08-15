import type { ShortcutSettings, ShortcutSettingsView } from "../settings.ts"
import { desktopRuntimeUrl } from "./desktop-runtime.ts"

export class ShortcutSettingsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface ShortcutSettingsTransport {
  get(): Promise<ShortcutSettingsView>
  update(
    patch: Partial<ShortcutSettings>,
    expectedRevision?: number,
  ): Promise<ShortcutSettingsView>
}

async function call(
  method: "settings.get" | "settings.update",
  payload: Record<string, unknown>,
): Promise<ShortcutSettingsView> {
  let response: Response
  try {
    response = await fetch(desktopRuntimeUrl("/cocode/shortcuts/api/" + method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new ShortcutSettingsApiError(
      "network",
      error instanceof Error ? error.message : String(error),
    )
  }
  const parsed: {
    readonly ok?: boolean
    readonly value?: unknown
    readonly error?: { readonly code?: string; readonly message?: string }
  } | null = await response.json().catch(() => null)
  if (!response.ok || parsed?.ok !== true || parsed.value === undefined) {
    throw new ShortcutSettingsApiError(
      parsed?.error?.code ?? "http",
      parsed?.error?.message ?? "HTTP " + String(response.status),
    )
  }
  return parsed.value as ShortcutSettingsView
}

export const shortcutSettingsTransport: ShortcutSettingsTransport = {
  get: () => call("settings.get", {}),
  update: (patch, expectedRevision) => call("settings.update", {
    patch,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }),
}
