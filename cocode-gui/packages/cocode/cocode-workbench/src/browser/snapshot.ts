/**
 * Snapshot assembly: run the in-page collector, redact, and turn the result
 * into either a full snapshot or a delta against the previous generation.
 *
 * Budget honesty matters more than budget size. A truncated snapshot that says
 * so lets the model scroll or refine; a silently truncated one makes it act on
 * a page it cannot see.
 */
import type { BrowserTab } from "./tabs.ts"
import { collectSnapshot, type CollectBudget, type RawNode, type RawSnapshot } from "./collect.ts"
import { looksSecret, redactSecrets } from "./policy.ts"
import type { BrowserActionResult, BrowserNode, BrowserSnapshot } from "./protocol.ts"

const BUDGET: CollectBudget = { maxNodes: 400, maxTextLength: 120 }
/** Beyond this many changed nodes a delta stops being cheaper than the truth. */
const DELTA_LIMIT = 60

export interface AttachmentSink {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<{
    attachmentId: string
    mediaType: string
    width: number
    height: number
  }>
}

/** Previous generation per tab, kept only to compute deltas. */
const history = new WeakMap<BrowserTab, Map<string, string>>()

function toNode(raw: RawNode): BrowserNode {
  const name = raw.name === "" ? undefined : redactSecrets(raw.name)
  const value = raw.secret || looksSecret(raw.name) ? (raw.value === "" ? undefined : "[redacted]") : (raw.value === "" ? undefined : redactSecrets(raw.value))
  return {
    ref: raw.ref,
    role: raw.role,
    depth: raw.depth,
    ...(name === undefined ? {} : { name }),
    ...(value === undefined ? {} : { value }),
    ...(raw.checked === "" ? {} : { checked: raw.checked === "mixed" ? "mixed" as const : raw.checked === "true" }),
    ...(raw.disabled ? { disabled: true } : {}),
    ...(raw.focused ? { focused: true } : {}),
    ...(raw.interactive ? { interactive: true } : {}),
    ...(raw.inViewport ? { inViewport: true } : {}),
  }
}

function fingerprint(node: BrowserNode): string {
  return JSON.stringify([node.role, node.name, node.value, node.checked, node.disabled, node.focused])
}

async function collect(tab: BrowserTab): Promise<RawSnapshot> {
  return tab.page.evaluate(collectSnapshot, BUDGET)
}

export interface SnapshotOptions {
  readonly screenshot?: boolean
  readonly attachments?: AttachmentSink
}

export async function takeSnapshot(tab: BrowserTab, options: SnapshotOptions = {}): Promise<BrowserSnapshot> {
  const raw = await collect(tab)
  const nodes = raw.nodes.map(toNode)

  tab.refs = new Map(raw.nodes.map(node => [node.ref, { backendNodeId: 0, role: node.role, ...(node.name === "" ? {} : { name: node.name }) }]))
  history.set(tab, new Map(nodes.map(node => [node.ref, fingerprint(node)])))

  const screenshot = options.screenshot === true && options.attachments !== undefined
    ? await captureScreenshot(tab, options.attachments)
    : undefined

  return {
    tabId: tab.id,
    generation: tab.generation,
    url: raw.url,
    title: raw.title,
    viewport: raw.viewport,
    ...(raw.focusedRef === "" ? {} : { focusedRef: raw.focusedRef }),
    nodes,
    ...(raw.total > nodes.length
      ? {
        truncation: {
          totalNodes: raw.total,
          returnedNodes: nodes.length,
          hint: "Off-screen and non-interactive nodes were dropped first. Scroll or narrow the target to see more.",
        },
      }
      : {}),
    ...(screenshot === undefined ? {} : { screenshot }),
    ...(tab.dialog === undefined ? {} : { pendingDialog: tab.dialog }),
    ...(raw.frames === 0 ? {} : { unexpandedFrames: raw.frames }),
  }
}

async function captureScreenshot(tab: BrowserTab, attachments: AttachmentSink): Promise<BrowserSnapshot["screenshot"]> {
  try {
    const data = await tab.page.screenshot({ type: "jpeg", quality: 70 })
    // An attachment reference, never inline base64: the session log has to stay replayable.
    const saved = await attachments.saveImage({ data: new Uint8Array(data), mediaType: "image/jpeg", name: `${tab.id}.jpg` })
    return { attachmentId: saved.attachmentId, mediaType: saved.mediaType, width: saved.width, height: saved.height }
  } catch { return undefined }
}

/**
 * Delta against the previous generation, falling back to a full snapshot when
 * the page changed so much that a delta would be larger than the truth.
 */
export async function takeDelta(tab: BrowserTab, note?: string): Promise<BrowserActionResult> {
  const previous = history.get(tab)
  const raw = await collect(tab)
  const nodes = raw.nodes.map(toNode)
  const current = new Map(nodes.map(node => [node.ref, fingerprint(node)]))
  tab.refs = new Map(raw.nodes.map(node => [node.ref, { backendNodeId: 0, role: node.role, ...(node.name === "" ? {} : { name: node.name }) }]))
  history.set(tab, current)

  const changed = previous === undefined ? nodes : nodes.filter(node => previous.get(node.ref) !== current.get(node.ref))
  const removed = previous === undefined ? [] : [...previous.keys()].filter(ref => !current.has(ref))

  const base: BrowserActionResult = {
    tabId: tab.id,
    generation: tab.generation,
    url: raw.url,
    title: raw.title,
    changed,
    removed,
    ...(tab.dialog === undefined ? {} : { pendingDialog: tab.dialog }),
    ...(note === undefined ? {} : { note }),
  }

  if (previous === undefined || changed.length + removed.length <= DELTA_LIMIT) return base

  return {
    ...base,
    changed: [],
    removed: [],
    full: {
      tabId: tab.id,
      generation: tab.generation,
      url: raw.url,
      title: raw.title,
      viewport: raw.viewport,
      ...(raw.focusedRef === "" ? {} : { focusedRef: raw.focusedRef }),
      nodes,
      ...(raw.total > nodes.length
        ? { truncation: { totalNodes: raw.total, returnedNodes: nodes.length, hint: "Off-screen and non-interactive nodes were dropped first." } }
        : {}),
      ...(tab.dialog === undefined ? {} : { pendingDialog: tab.dialog }),
      ...(raw.frames === 0 ? {} : { unexpandedFrames: raw.frames }),
    },
  }
}
