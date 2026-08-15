import { describe, expect, it, vi } from "vitest"
import type { ShortcutSettingsView } from "../src/settings.ts"
import {
  ShortcutSettingsApiError,
  type ShortcutSettingsTransport,
} from "../src/client/settings-api.ts"
import { ShortcutSettingsController } from "../src/client/settings-controller.ts"

function view(
  bindings: ShortcutSettingsView["value"]["bindings"] = {},
  revision = 0,
): ShortcutSettingsView {
  return {
    value: { version: 1, bindings },
    revision,
    writable: true,
  }
}

describe("ShortcutSettingsController", () => {
  it("loads remote settings and advances the revision after a write", async () => {
    const update = vi.fn(async () => view({
      "cocode.sidebar.toggle": { combo: { key: "k", primary: true } },
    }, 2))
    const transport: ShortcutSettingsTransport = {
      get: vi.fn(async () => view({}, 1)),
      update,
    }
    const controller = new ShortcutSettingsController(transport)

    await controller.reload()
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      revision: 1,
      value: { bindings: {} },
    })

    await controller.setBindings({
      "cocode.sidebar.toggle": { combo: { key: "k", primary: true } },
    })
    expect(update).toHaveBeenCalledWith({
      version: 1,
      bindings: {
        "cocode.sidebar.toggle": { combo: { key: "k", primary: true } },
      },
    }, 1)
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      revision: 2,
    })
  })

  it("reloads the host state after a revision conflict", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce(view({}, 1))
      .mockResolvedValueOnce(view({
        "cocode.newSession": { disabled: true },
      }, 2))
    const transport: ShortcutSettingsTransport = {
      get,
      update: vi.fn(async () => {
        throw new ShortcutSettingsApiError("settings-conflict", "stale")
      }),
    }
    const controller = new ShortcutSettingsController(transport)

    await controller.reload()
    await controller.setBindings({
      "cocode.sidebar.toggle": { disabled: true },
    })

    expect(get).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).toMatchObject({
      revision: 2,
      value: {
        bindings: {
          "cocode.newSession": { disabled: true },
        },
      },
    })
  })

  it("uses memory mode when the route was never available", async () => {
    const transport: ShortcutSettingsTransport = {
      get: vi.fn(async () => {
        throw new ShortcutSettingsApiError("network", "offline")
      }),
      update: vi.fn(),
    }
    const controller = new ShortcutSettingsController(transport)

    await controller.reload()
    expect(controller.getSnapshot()).toMatchObject({
      status: "memory",
      writable: true,
    })
    await controller.setBindings({
      orphan: { combo: { key: "F2" } },
    })
    expect(controller.getSnapshot().value.bindings).toEqual({
      orphan: { combo: { key: "F2" } },
    })
  })

  it("supports external reload and reset without switching account profiles", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce(view({
        "cocode.sidebar.toggle": { disabled: true },
      }, 3))
      .mockResolvedValueOnce(view({
        "cocode.sidebar.toggle": { combo: { key: "j", primary: true } },
      }, 4))
    const update = vi.fn(async () => view({}, 5))
    const controller = new ShortcutSettingsController({ get, update })

    await controller.reload()
    await controller.reload()
    expect(controller.getSnapshot().revision).toBe(4)
    await controller.resetBinding("cocode.sidebar.toggle")
    expect(update).toHaveBeenCalledWith({ version: 1, bindings: {} }, 4)
    expect(controller.getSnapshot().value.bindings).toEqual({})
  })
})
