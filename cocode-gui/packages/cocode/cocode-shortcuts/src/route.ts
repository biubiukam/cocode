import { SettingsConflictError } from "@deepseek-ai/dsh-settings"
import type { ShortcutSettings, ShortcutSettingsView, UserBinding } from "./settings.ts"
import type { Context, ShortcutsHttpRequest } from "./context-types.ts"
import { isTrustedApiRequest } from "./trust-fence.ts"
import {
  readJsonBody,
  ShortcutsRouteError,
  writeError,
  writeJson,
  writeOk,
} from "./wire.ts"

export const SHORTCUTS_API_PREFIX = "/cocode/shortcuts/api"
const COMMAND_ID = /^[A-Za-z0-9._:-]{1,128}$/
const RESERVED_COMMAND_IDS = new Set(["__proto__", "constructor", "prototype"])
const BINDING_KEYS = new Set(["combo", "scope", "disabled"])
const COMBO_KEYS = new Set(["key", "primary", "alt", "shift", "control"])

export type { ShortcutSettingsView } from "./settings.ts"

export interface ShortcutSettingsFace {
  get(): ShortcutSettingsView
  update(
    patch: Partial<ShortcutSettings>,
    expectedRevision?: number,
  ): Promise<ShortcutSettingsView>
}

type ApiMethod = (payload: unknown) => unknown | Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function invalid(message: string): never {
  throw new ShortcutsRouteError("bad-request", message)
}

function parseCombo(value: unknown): NonNullable<UserBinding["combo"]> {
  if (!isRecord(value)) invalid("combo must be a plain object")
  for (const key of Object.keys(value)) {
    if (!COMBO_KEYS.has(key)) invalid("unknown combo field \"" + key + "\"")
  }
  if (typeof value.key !== "string" || value.key.length === 0 || value.key.length > 64) {
    invalid("combo.key must be a non-empty string with at most 64 characters")
  }
  const combo: {
    key: string
    primary?: boolean
    alt?: boolean
    shift?: boolean
    control?: boolean
  } = { key: value.key }
  for (const key of ["primary", "alt", "shift", "control"] as const) {
    const candidate = value[key]
    if (candidate === undefined) continue
    if (typeof candidate !== "boolean") invalid("combo." + key + " must be a boolean")
    combo[key] = candidate
  }
  return combo
}

function parseBinding(commandId: string, value: unknown): UserBinding {
  if (!COMMAND_ID.test(commandId) || RESERVED_COMMAND_IDS.has(commandId)) {
    invalid("invalid commandId \"" + commandId + "\"")
  }
  if (!isRecord(value)) invalid("binding \"" + commandId + "\" must be a plain object")
  for (const key of Object.keys(value)) {
    if (!BINDING_KEYS.has(key)) invalid("unknown binding field \"" + key + "\"")
  }
  const binding: {
    combo?: NonNullable<UserBinding["combo"]>
    scope?: "app" | "global"
    disabled?: boolean
  } = {}
  if (value.combo !== undefined) binding.combo = parseCombo(value.combo)
  if (value.scope !== undefined) {
    if (value.scope !== "app" && value.scope !== "global") {
      invalid("binding \"" + commandId + "\".scope must be app or global")
    }
    binding.scope = value.scope
  }
  if (value.disabled !== undefined) {
    if (typeof value.disabled !== "boolean") {
      invalid("binding \"" + commandId + "\".disabled must be a boolean")
    }
    binding.disabled = value.disabled
  }
  return binding
}

function parseBindings(value: unknown): Record<string, UserBinding> {
  if (!isRecord(value)) invalid("bindings must be a plain object")
  const entries = Object.entries(value)
  if (entries.length > 512) invalid("bindings cannot contain more than 512 commands")
  return Object.fromEntries(entries.map(([commandId, binding]) => [
    commandId,
    parseBinding(commandId, binding),
  ]))
}

function parseUpdatePayload(payload: unknown): {
  readonly patch: Partial<ShortcutSettings>
  readonly expectedRevision?: number
} {
  if (!isRecord(payload)) invalid("request payload must be a plain object")
  for (const key of Object.keys(payload)) {
    if (key !== "patch" && key !== "expectedRevision") {
      invalid("unknown request field \"" + key + "\"")
    }
  }
  if (!isRecord(payload.patch)) invalid("patch must be a plain object")
  const patch: { version?: 1; bindings?: Record<string, UserBinding> } = {}
  for (const key of Object.keys(payload.patch)) {
    if (key !== "version" && key !== "bindings") invalid("unknown settings field \"" + key + "\"")
  }
  if (payload.patch.version !== undefined) {
    if (payload.patch.version !== 1) invalid("version must be 1")
    patch.version = 1
  }
  if (payload.patch.bindings !== undefined) {
    patch.bindings = parseBindings(payload.patch.bindings)
  }
  let expectedRevision: number | undefined
  if (payload.expectedRevision !== undefined) {
    if (
      typeof payload.expectedRevision !== "number"
      || !Number.isInteger(payload.expectedRevision)
      || payload.expectedRevision < 0
    ) {
      invalid("expectedRevision must be a non-negative integer")
    }
    expectedRevision = payload.expectedRevision
  }
  return {
    patch,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

function buildApi(getSettings: () => ShortcutSettingsFace | undefined): Record<string, ApiMethod> {
  return {
    "settings.get": () => {
      const settings = getSettings()
      if (settings === undefined) {
        throw new ShortcutsRouteError(
          "settings-rejected",
          "the settings service is not mounted in this deployment",
          503,
        )
      }
      return settings.get()
    },
    "settings.update": async (payload) => {
      const settings = getSettings()
      if (settings === undefined) {
        throw new ShortcutsRouteError(
          "settings-rejected",
          "the settings service is not mounted in this deployment",
          503,
        )
      }
      const { patch, expectedRevision } = parseUpdatePayload(payload)
      try {
        return await settings.update(patch, expectedRevision)
      } catch (error) {
        if (error instanceof SettingsConflictError) {
          throw new ShortcutsRouteError("settings-conflict", error.message, 409)
        }
        throw new ShortcutsRouteError(
          "settings-rejected",
          error instanceof Error ? error.message : String(error),
          400,
        )
      }
    },
  }
}

export function registerShortcutsRoute(
  ctx: Context,
  getSettings: () => ShortcutSettingsFace | undefined,
): () => void {
  const api = buildApi(getSettings)
  const fence = (request: ShortcutsHttpRequest): boolean =>
    isTrustedApiRequest(request, ctx.webRuntime.trustedHosts)
  return ctx.webServer.register({
    kind: "prefix",
    path: SHORTCUTS_API_PREFIX,
    handler: async (request, response) => {
      if (!fence(request)) {
        writeJson(response, 403, {
          ok: false,
          error: { code: "forbidden", message: "forbidden" },
        })
        return
      }
      if (request.method !== "POST") {
        writeJson(response, 405, {
          ok: false,
          error: { code: "method-not-allowed", message: "method not allowed" },
        })
        return
      }
      const pathname = new URL(request.url ?? "/", "http://dsh.internal").pathname
      const prefix = SHORTCUTS_API_PREFIX + "/"
      const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined
      if (method === undefined || method.includes("/")) {
        writeError(
          response,
          new ShortcutsRouteError("not-found", "unknown shortcuts API method", 404),
        )
        return
      }
      try {
        const handler = api[method]
        if (handler === undefined) {
          throw new ShortcutsRouteError(
            "not-found",
            "unknown shortcuts API method \"" + method + "\"",
            404,
          )
        }
        writeOk(response, await handler(await readJsonBody(request)))
      } catch (error) {
        writeError(response, error)
      }
    },
  })
}
