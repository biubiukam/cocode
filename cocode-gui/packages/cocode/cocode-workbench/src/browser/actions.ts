/**
 * Action execution.
 *
 * Every action is bounded: a page that never settles must produce a structured
 * timeout rather than an agent that hangs forever. Refs resolve through the
 * in-page store, so a stale ref fails loudly instead of hitting the wrong node.
 */
import { isAbsolute, relative, resolve as resolvePath } from "pathe"
import type { ElementHandle } from "playwright-core"
import type { BrowserTab } from "./tabs.ts"
import { BrowserError, type BrowserAction, type BrowserModifier } from "./protocol.ts"

const ACTION_TIMEOUT_MS = 15_000
const SETTLE_TIMEOUT_MS = 2_000
const WAIT_TIMEOUT_MS = 20_000

const PLAYWRIGHT_MODIFIER: Readonly<Record<BrowserModifier, "Alt" | "Control" | "Meta" | "Shift">> = {
  alt: "Alt", ctrl: "Control", meta: "Meta", shift: "Shift",
}

function modifiers(list: readonly BrowserModifier[] | undefined): ("Alt" | "Control" | "Meta" | "Shift")[] {
  return (list ?? []).map(name => PLAYWRIGHT_MODIFIER[name])
}

async function withTimeout<T>(operation: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new BrowserError("BROWSER_ACTION_TIMEOUT", `${label} did not finish within ${String(ms)}ms.`)) }, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function resolveRef(tab: BrowserTab, ref: string): Promise<ElementHandle<Element>> {
  if (!tab.refs.has(ref)) {
    throw new BrowserError("BROWSER_STALE_SNAPSHOT", `Ref ${ref} is not part of the current snapshot. Take a new snapshot first.`)
  }
  const handle = await tab.page.evaluateHandle(
    (value: string) => (window as unknown as { __cocodeRefs__?: Map<string, Element> }).__cocodeRefs__?.get(value),
    ref,
  )
  const element = handle.asElement() as ElementHandle<Element> | null
  if (element === null) {
    await handle.dispose()
    throw new BrowserError("BROWSER_REF_NOT_FOUND", `Ref ${ref} no longer resolves to an element on this page.`)
  }
  return element
}

/** Bounded settle: give the page a moment to react, never block on it. */
async function settle(tab: BrowserTab): Promise<void> {
  await Promise.race([
    tab.page.waitForLoadState("domcontentloaded", { timeout: SETTLE_TIMEOUT_MS }).catch(() => { /* no navigation */ }),
    new Promise<void>(done => setTimeout(done, SETTLE_TIMEOUT_MS)),
  ])
}

export interface ActionOptions {
  /** Upload sources must stay inside this directory. */
  readonly workspace?: string
}

function assertInsideWorkspace(workspace: string | undefined, path: string): string {
  const absolute = isAbsolute(path) ? resolvePath(path) : resolvePath(workspace ?? process.cwd(), path)
  if (workspace === undefined) throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", "Uploads require an active workspace.")
  // pathe emits forward-slash output, so a single posix check suffices.
  const rel = relative(workspace, absolute)
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new BrowserError("BROWSER_NAVIGATION_BLOCKED", `${path} is outside the active workspace.`)
  }
  return absolute
}

async function waitFor(tab: BrowserTab, action: Extract<BrowserAction, { kind: "wait" }>): Promise<void> {
  switch (action.condition) {
    case "load":
      await tab.page.waitForLoadState("load", { timeout: WAIT_TIMEOUT_MS })
      return
    case "network-idle":
      await tab.page.waitForLoadState("networkidle", { timeout: WAIT_TIMEOUT_MS })
      return
    case "text": {
      if (action.value === undefined) throw new BrowserError("BROWSER_ACTION_TIMEOUT", "wait on text requires a value.")
      await tab.page.getByText(action.value).first().waitFor({ timeout: WAIT_TIMEOUT_MS })
      return
    }
    case "url": {
      if (action.value === undefined) throw new BrowserError("BROWSER_ACTION_TIMEOUT", "wait on url requires a value.")
      await tab.page.waitForURL(url => url.href.includes(action.value ?? ""), { timeout: WAIT_TIMEOUT_MS })
      return
    }
  }
}

/** Run one action against the tab. The caller owns lease and approval checks. */
export async function performAction(tab: BrowserTab, action: BrowserAction, options: ActionOptions = {}): Promise<void> {
  if (tab.hasPendingDialog() && action.kind !== "dialog") {
    throw new BrowserError("BROWSER_DIALOG_PENDING", "A native dialog is blocking this page. Answer it before acting.")
  }

  const run = async (): Promise<void> => {
    switch (action.kind) {
      case "click": {
        const element = await resolveRef(tab, action.ref)
        await element.click({ button: action.button ?? "left", modifiers: modifiers(action.modifiers), timeout: ACTION_TIMEOUT_MS })
        await element.dispose()
        return
      }
      case "hover": {
        const element = await resolveRef(tab, action.ref)
        await element.hover({ timeout: ACTION_TIMEOUT_MS })
        await element.dispose()
        return
      }
      case "type": {
        const element = await resolveRef(tab, action.ref)
        if (action.clear === true) await element.fill("", { timeout: ACTION_TIMEOUT_MS })
        await element.type(action.text, { timeout: ACTION_TIMEOUT_MS })
        if (action.submit === true) await element.press("Enter", { timeout: ACTION_TIMEOUT_MS })
        await element.dispose()
        return
      }
      case "press": {
        if (action.ref === undefined) {
          await tab.page.keyboard.press(action.key)
          return
        }
        const element = await resolveRef(tab, action.ref)
        await element.press(action.key, { timeout: ACTION_TIMEOUT_MS })
        await element.dispose()
        return
      }
      case "scroll": {
        const amount = (action.amount ?? 400) * (action.direction === "up" ? -1 : 1)
        if (action.ref === undefined) {
          await tab.page.mouse.wheel(0, amount)
          return
        }
        const element = await resolveRef(tab, action.ref)
        await element.evaluate((node: Element, delta: number) => { node.scrollBy(0, delta) }, amount)
        await element.dispose()
        return
      }
      case "select": {
        const element = await resolveRef(tab, action.ref)
        await element.selectOption([...action.values], { timeout: ACTION_TIMEOUT_MS })
        await element.dispose()
        return
      }
      case "navigate": {
        if (action.to === "back") await tab.page.goBack({ timeout: ACTION_TIMEOUT_MS })
        else if (action.to === "forward") await tab.page.goForward({ timeout: ACTION_TIMEOUT_MS })
        else await tab.page.reload({ timeout: ACTION_TIMEOUT_MS })
        return
      }
      case "upload": {
        const element = await resolveRef(tab, action.ref)
        const paths = action.paths.map(path => assertInsideWorkspace(options.workspace, path))
        await element.setInputFiles(paths, { timeout: ACTION_TIMEOUT_MS })
        await element.dispose()
        return
      }
      case "dialog": {
        if (!tab.hasPendingDialog()) throw new BrowserError("BROWSER_DIALOG_PENDING", "There is no dialog to answer.")
        tab.settleDialog({ accept: action.accept, ...(action.text === undefined ? {} : { text: action.text }) })
        return
      }
      case "wait": {
        await waitFor(tab, action)
        return
      }
    }
  }

  const budget = action.kind === "wait" ? WAIT_TIMEOUT_MS + 1_000 : ACTION_TIMEOUT_MS + 1_000
  await withTimeout(run(), budget, `browser ${action.kind}`)
  if (action.kind !== "wait") await settle(tab)
}
