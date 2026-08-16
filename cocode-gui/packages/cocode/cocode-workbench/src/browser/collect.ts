/**
 * In-page accessibility collection.
 *
 * The budget is applied here, inside the page, rather than in Node. A real
 * site has tens of thousands of nodes; serialising all of them across CDP just
 * to drop 95% of them would make every snapshot slow for no benefit.
 *
 * The exported function is stringified by Playwright and evaluated in the page,
 * so it may not close over anything from this module.
 */

export interface CollectBudget {
  readonly maxNodes: number
  readonly maxTextLength: number
}

export interface RawNode {
  readonly ref: string
  readonly role: string
  readonly depth: number
  readonly name: string
  readonly value: string
  readonly checked: "true" | "false" | "mixed" | ""
  readonly disabled: boolean
  readonly focused: boolean
  readonly interactive: boolean
  readonly inViewport: boolean
  readonly secret: boolean
}

export interface RawSnapshot {
  readonly nodes: readonly RawNode[]
  readonly total: number
  readonly frames: number
  readonly focusedRef: string
  readonly url: string
  readonly title: string
  readonly viewport: { readonly width: number; readonly height: number; readonly deviceScaleFactor: number }
}

/**
 * Walk the visible DOM, score every element and return the highest-value slice.
 * Refs are stored on the page so an action can resolve one back to its element.
 */
export function collectSnapshot(budget: CollectBudget): RawSnapshot {
  const store = new Map<string, Element>()
  ;(window as unknown as { __cocodeRefs__?: Map<string, Element> }).__cocodeRefs__ = store

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const ROLE_BY_TAG: Record<string, string> = {
    A: "link", BUTTON: "button", INPUT: "textbox", TEXTAREA: "textbox", SELECT: "combobox",
    IMG: "image", H1: "heading", H2: "heading", H3: "heading", H4: "heading", H5: "heading", H6: "heading",
    NAV: "navigation", MAIN: "main", HEADER: "banner", FOOTER: "contentinfo", FORM: "form",
    TABLE: "table", TR: "row", TD: "cell", TH: "columnheader", UL: "list", OL: "list", LI: "listitem",
    LABEL: "label", P: "paragraph", SUMMARY: "button", DIALOG: "dialog", OPTION: "option",
  }

  const INPUT_ROLES: Record<string, string> = {
    checkbox: "checkbox", radio: "radio", submit: "button", button: "button", reset: "button",
    range: "slider", file: "button", search: "searchbox", email: "textbox", password: "textbox",
    number: "spinbutton", tel: "textbox", url: "textbox", text: "textbox",
  }

  const SECRET_PATTERN = /(password|passwd|secret|token|api[-_ ]?key|authorization|credit|cvv|ssn)/i

  const clip = (value: string): string => {
    const flat = value.replace(/\s+/g, " ").trim()
    return flat.length > budget.maxTextLength ? `${flat.slice(0, budget.maxTextLength)}…` : flat
  }

  const roleOf = (element: Element): string => {
    const explicit = element.getAttribute("role")
    if (explicit !== null && explicit.trim() !== "") return explicit.trim().split(/\s+/)[0] ?? "generic"
    if (element instanceof HTMLInputElement) return INPUT_ROLES[element.type] ?? "textbox"
    return ROLE_BY_TAG[element.tagName] ?? "generic"
  }

  const labelText = (element: Element): string => {
    const labelledBy = element.getAttribute("aria-labelledby")
    if (labelledBy !== null) {
      const parts = labelledBy.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent ?? "")
        .filter(text => text !== "")
      if (parts.length > 0) return parts.join(" ")
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      for (const label of element.labels ?? []) {
        if (label.textContent !== null && label.textContent.trim() !== "") return label.textContent
      }
    }
    return ""
  }

  const nameOf = (element: Element): string => {
    const aria = element.getAttribute("aria-label")
    if (aria !== null && aria.trim() !== "") return clip(aria)
    const labelled = labelText(element)
    if (labelled !== "") return clip(labelled)
    if (element instanceof HTMLImageElement && element.alt !== "") return clip(element.alt)
    const placeholder = element.getAttribute("placeholder")
    if (placeholder !== null && placeholder.trim() !== "") return clip(placeholder)
    const title = element.getAttribute("title")
    if (title !== null && title.trim() !== "") return clip(title)
    // Own text only: a container would otherwise absorb the whole subtree.
    const own = [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent ?? "")
      .join(" ")
      .trim()
    if (own !== "") return clip(own)
    if (element.children.length === 0 && element.textContent !== null) return clip(element.textContent)
    return ""
  }

  const isInteractive = (element: Element, role: string): boolean => {
    if (element instanceof HTMLAnchorElement) return element.hasAttribute("href")
    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) return true
    if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return true
    if (element.hasAttribute("onclick") || element.hasAttribute("tabindex")) return true
    if ((element as HTMLElement).isContentEditable) return true
    return ["button", "link", "checkbox", "radio", "menuitem", "tab", "switch", "option", "combobox", "searchbox", "textbox", "slider", "spinbutton"].includes(role)
  }

  const valueOf = (element: Element, secret: boolean): string => {
    if (secret) return ""
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") return ""
      return clip(element.value)
    }
    if (element instanceof HTMLTextAreaElement) return clip(element.value)
    if (element instanceof HTMLSelectElement) return clip(element.value)
    return ""
  }

  const checkedOf = (element: Element): RawNode["checked"] => {
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      return element.checked ? "true" : "false"
    }
    const aria = element.getAttribute("aria-checked")
    if (aria === "true" || aria === "false" || aria === "mixed") return aria
    return ""
  }

  const active = document.activeElement
  let focusedRef = ""
  let total = 0
  let index = 0

  interface Scored { readonly node: RawNode; readonly order: number; readonly score: number }
  const scored: Scored[] = []

  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_ELEMENT)
  let current: Node | null = walker.currentNode
  while (current !== null) {
    const element = current as Element
    current = walker.nextNode()
    if (element.tagName === "SCRIPT" || element.tagName === "STYLE" || element.tagName === "NOSCRIPT") continue

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    // A label that names a control is already represented by that control.
    // Emitting both gives the model two same-named refs, one of which cannot
    // be typed into.
    if (element instanceof HTMLLabelElement && element.control !== null) continue

    const role = roleOf(element)
    const name = nameOf(element)
    const interactive = isInteractive(element, role)
    // A generic box with no name and no behaviour carries no information.
    if (!interactive && name === "" && role === "generic") continue

    total += 1
    const inViewport = rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth
    const distance = inViewport ? 0 : rect.top < 0 ? -rect.top : rect.top - viewportHeight

    let depth = 0
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) depth += 1

    const secretHint = SECRET_PATTERN.test(`${name} ${element.getAttribute("name") ?? ""} ${element.id}`)
      || (element instanceof HTMLInputElement && element.type === "password")

    const ref = `e${String(index)}`
    index += 1
    store.set(ref, element)
    if (element === active) focusedRef = ref

    const node: RawNode = {
      ref,
      role,
      depth,
      name,
      value: valueOf(element, secretHint),
      checked: checkedOf(element),
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
      focused: element === active,
      interactive,
      inViewport,
      secret: secretHint,
    }

    // Interaction beats prose, and the viewport beats everything below the fold.
    const score = (interactive ? 1000 : 0) + (inViewport ? 500 : Math.max(0, 200 - distance / 10)) + (name === "" ? 0 : 50)
    scored.push({ node, order: scored.length, score })
  }

  const selected = scored.length <= budget.maxNodes
    ? scored
    : [...scored].sort((left, right) => right.score - left.score).slice(0, budget.maxNodes)
  // Restore document order: the model reads structure, not a ranking.
  const ordered = [...selected].sort((left, right) => left.order - right.order).map(entry => entry.node)

  return {
    nodes: ordered,
    total,
    frames: document.querySelectorAll("iframe, frame").length,
    focusedRef,
    url: window.location.href,
    title: document.title,
    viewport: { width: viewportWidth, height: viewportHeight, deviceScaleFactor: window.devicePixelRatio },
  }
}
