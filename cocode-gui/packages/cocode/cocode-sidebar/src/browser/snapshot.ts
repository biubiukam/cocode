/**
 * The page observation the model reads: an accessibility projection, not
 * pixels and not HTML.
 *
 * Raw DOM is unusable as an agent surface — a modern page is megabytes of
 * generated class names, and the model would spend its whole budget parsing
 * markup it cannot act on. The accessibility tree is the same information the
 * page already publishes to screen readers: semantic role, name, and state,
 * with the noise gone.
 *
 * Three CDP calls build the whole snapshot regardless of page size: the AX
 * tree for semantics, one DOM snapshot for the geometry AND attributes of
 * every node, and layout metrics for the viewport. Per-node roundtrips are
 * reserved for acting, where only one node is involved.
 */
import type { BrowserNode, BrowserSnapshot } from './protocol.ts'
import {
  attributeOf,
  intersects,
  type AxNode,
  type AxTreeResponse,
  type CdpSession,
  type LayoutMetricsResponse,
  type Rect,
} from './cdp.ts'

/** Maximum characters retained of one accessible name or value. */
const TEXT_LIMIT = 160

/** Roles the model can act on; everything else is context. */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'slider', 'spinbutton', 'switch', 'tab', 'treeitem', 'disclosuretriangle',
  'ColorWell', 'DateTime', 'InputTime', 'MenuListOption', 'PopUpButton',
])

/** Roles worth retaining for orientation even though they are not actionable. */
const STRUCTURAL_ROLES = new Set([
  'heading', 'StaticText', 'image', 'img', 'list', 'listitem', 'table', 'row',
  'cell', 'columnheader', 'rowheader', 'form', 'navigation', 'main', 'article',
  'banner', 'contentinfo', 'complementary', 'region', 'dialog', 'alert',
  'alertdialog', 'status', 'progressbar', 'tabpanel', 'paragraph',
])

/** Values that look like credentials are never echoed back to the model. */
const SECRET_SHAPED = /^(?:[A-Za-z0-9+/_-]{24,}={0,2}|[0-9a-f]{32,})$/

/** Geometry and markup facts of one DOM node, harvested in one bulk call. */
interface NodeFacts {
  rect?: Rect
  nodeName?: string
  attributes?: Record<string, string>
}

/** Options bounding one snapshot. */
export interface SnapshotOptions {
  /** Maximum nodes returned; the rest are summarized in `truncation`. */
  maxNodes: number
}

/** A built snapshot plus the ref table the action dispatcher resolves against. */
export interface SnapshotResult {
  snapshot: Omit<BrowserSnapshot, 'tabId' | 'generation' | 'screenshot' | 'pendingDialog'>
  /** ref → backendDOMNodeId for exactly the nodes this snapshot returned. */
  refs: Map<string, number>
}

/**
 * Build one page observation.
 *
 * @param cdp - Session attached to the page being observed.
 * @param options - Node budget.
 */
export async function buildSnapshot(cdp: CdpSession, options: SnapshotOptions): Promise<SnapshotResult> {
  const [tree, facts, viewport] = await Promise.all([
    cdp.send('Accessibility.getFullAXTree') as Promise<AxTreeResponse>,
    collectNodeFacts(cdp),
    readViewport(cdp),
  ])

  const byId = new Map<string, AxNode>()
  for (const node of tree.nodes) byId.set(node.nodeId, node)
  const root = tree.nodes[0]

  const candidates: Array<{ node: Omit<BrowserNode, 'ref'>; backendId: number; order: number; priority: number }> = []
  let focusedBackendId: number | undefined
  let order = 0

  const walk = (axNode: AxNode, depth: number): void => {
    const backendId = axNode.backendDOMNodeId
    const props = propertiesOf(axNode)
    if (props.focused === true && backendId !== undefined) focusedBackendId = backendId
    // An ignored node contributes nothing itself but still parents visible
    // content (wrapper divs are the common case), so recursion continues at
    // the SAME depth — otherwise the reported depth would track markup
    // nesting rather than perceived structure.
    const kept = axNode.ignored === true ? undefined : projectNode(axNode, props, facts, viewport)
    if (kept !== undefined && backendId !== undefined) {
      candidates.push({ node: { ...kept, depth }, backendId, order, priority: priorityOf(kept) })
      order += 1
    }
    for (const childId of axNode.childIds ?? []) {
      const child = byId.get(childId)
      if (child !== undefined) walk(child, kept === undefined ? depth : depth + 1)
    }
  }
  if (root !== undefined) walk(root, 0)

  const selected = applyBudget(candidates, options.maxNodes)
  const refs = new Map<string, number>()
  const nodes: BrowserNode[] = selected.map((candidate) => {
    const ref = `e${String(candidate.backendId)}`
    refs.set(ref, candidate.backendId)
    return { ...candidate.node, ref }
  })
  const focusedIndex = focusedBackendId === undefined
    ? -1
    : selected.findIndex(candidate => candidate.backendId === focusedBackendId)

  const [url, title] = await Promise.all([readUrl(cdp), readTitle(cdp)])
  return {
    snapshot: {
      url,
      title,
      viewport: viewport.size,
      focusedRef: focusedIndex >= 0 ? nodes[focusedIndex]?.ref : undefined,
      nodes,
      truncation: candidates.length > nodes.length
        ? {
          totalNodes: candidates.length,
          returnedNodes: nodes.length,
          hint: 'Off-screen and non-interactive nodes were dropped first. Scroll toward the region you need and snapshot again.',
        }
        : undefined,
    },
    refs,
  }
}

/** Flatten an AX node's property list into a keyed record. */
function propertiesOf(node: AxNode): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const property of node.properties ?? []) out[property.name] = property.value?.value
  return out
}

/** Project one AX node into the model-facing shape, or drop it. */
function projectNode(
  node: AxNode,
  props: Record<string, unknown>,
  facts: Map<number, NodeFacts>,
  viewport: ViewportInfo,
): Omit<BrowserNode, 'ref' | 'depth'> | undefined {
  const role = node.role?.value
  if (role === undefined || role === 'none' || role === 'presentation') return undefined
  const backendId = node.backendDOMNodeId
  const fact = backendId === undefined ? undefined : facts.get(backendId)
  const name = bound(node.name?.value)
  const interactive = INTERACTIVE_ROLES.has(role)
  // A generic container earns its place only by carrying a name; without one
  // it is pure markup scaffolding.
  if (!interactive && !STRUCTURAL_ROLES.has(role) && name === undefined) return undefined
  if (!interactive && role === 'generic') return undefined
  return {
    role,
    name,
    value: valueOf(node, fact),
    interactive,
    checked: booleanProp(props.checked),
    selected: booleanProp(props.selected),
    expanded: booleanProp(props.expanded),
    disabled: props.disabled === true ? true : undefined,
    inViewport: fact?.rect === undefined ? false : intersects(fact.rect, viewport.rect),
  }
}

/** Read a node's value, masking anything a password field or a token holds. */
function valueOf(node: AxNode, fact: NodeFacts | undefined): string | undefined {
  const raw = node.value?.value
  if (raw === undefined || raw === '') return undefined
  const text = typeof raw === 'number' ? String(raw) : raw
  const type = fact?.attributes?.type?.toLowerCase()
  if (type === 'password') return text === '' ? undefined : '••••••••'
  if (SECRET_SHAPED.test(text)) return '«redacted»'
  return bound(text)
}

/** Retain only booleans; CDP reports tri-state checkboxes as 'mixed'. */
function booleanProp(value: unknown): boolean | undefined {
  if (value === true) return true
  if (value === false) return false
  return undefined
}

/** Bound one text field, marking the cut so the model knows it is partial. */
function bound(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed === '') return undefined
  return trimmed.length <= TEXT_LIMIT ? trimmed : `${trimmed.slice(0, TEXT_LIMIT)}…`
}

/** Rank a node so the budget drops the least useful material first. */
function priorityOf(node: Omit<BrowserNode, 'ref' | 'depth'>): number {
  if (node.interactive) return node.inViewport ? 3 : 2
  return node.inViewport ? 1 : 0
}

/**
 * Keep the highest-priority nodes up to the budget, then restore document
 * order — a snapshot the model reads top-to-bottom must stay in page order
 * even after the middle was thinned.
 */
function applyBudget<T extends { order: number; priority: number }>(candidates: T[], maxNodes: number): T[] {
  if (candidates.length <= maxNodes) return candidates
  const ranked = [...candidates].sort((a, b) => b.priority - a.priority || a.order - b.order)
  return ranked.slice(0, maxNodes).sort((a, b) => a.order - b.order)
}

/** Viewport geometry in CSS pixels. */
interface ViewportInfo {
  /** The visible region in document coordinates (for intersection tests). */
  rect: Rect
  size: { width: number; height: number; deviceScaleFactor: number }
}

async function readViewport(cdp: CdpSession): Promise<ViewportInfo> {
  const metrics = await cdp.send('Page.getLayoutMetrics') as LayoutMetricsResponse
  const view = metrics.cssVisualViewport ?? metrics.cssLayoutViewport
  return {
    rect: { x: view.pageX, y: view.pageY, width: view.clientWidth, height: view.clientHeight },
    size: { width: Math.round(view.clientWidth), height: Math.round(view.clientHeight), deviceScaleFactor: 1 },
  }
}

/**
 * Harvest geometry, tag names and attributes for every node in one
 * `DOMSnapshot.captureSnapshot` call. The response is column-oriented: the
 * `strings` table is shared and each per-node array is indexed by node index,
 * while `layout.nodeIndex` maps laid-out boxes back to those nodes.
 */
async function collectNodeFacts(cdp: CdpSession): Promise<Map<number, NodeFacts>> {
  const out = new Map<number, NodeFacts>()
  const response = await cdp.send('DOMSnapshot.captureSnapshot', {
    computedStyles: [],
    includeDOMRects: false,
    includePaintOrder: false,
  }).catch(() => undefined) as CaptureSnapshotResponse | undefined
  if (response === undefined) return out
  const strings = response.strings
  const text = (index: number | undefined): string | undefined =>
    index === undefined || index < 0 ? undefined : strings[index]
  for (const document of response.documents) {
    const backendIds = document.nodes.backendNodeId ?? []
    const names = document.nodes.nodeName ?? []
    const attributeIndices = document.nodes.attributes ?? []
    for (let index = 0; index < backendIds.length; index += 1) {
      const backendId = backendIds[index]
      if (backendId === undefined) continue
      const flat = attributeIndices[index]
      out.set(backendId, {
        nodeName: text(names[index]),
        attributes: flat === undefined ? undefined : decodeAttributes(flat, strings),
      })
    }
    const nodeIndex = document.layout.nodeIndex
    const bounds = document.layout.bounds
    for (let index = 0; index < nodeIndex.length; index += 1) {
      const backendId = backendIds[nodeIndex[index] ?? -1]
      const box = bounds[index]
      if (backendId === undefined || box === undefined) continue
      const fact = out.get(backendId)
      if (fact !== undefined) {
        fact.rect = { x: box[0] ?? 0, y: box[1] ?? 0, width: box[2] ?? 0, height: box[3] ?? 0 }
      }
    }
  }
  return out
}

/** Column-oriented `DOMSnapshot.captureSnapshot` response (fields read here). */
interface CaptureSnapshotResponse {
  strings: string[]
  documents: Array<{
    nodes: { backendNodeId?: number[]; nodeName?: number[]; attributes?: number[][] }
    layout: { nodeIndex: number[]; bounds: number[][] }
  }>
}

/** Decode CDP's `[nameIndex, valueIndex, ...]` attribute encoding. */
function decodeAttributes(flat: readonly number[], strings: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const name = strings[flat[index] ?? -1]
    const value = strings[flat[index + 1] ?? -1]
    if (name !== undefined) out[name] = value ?? ''
  }
  return out
}

async function readUrl(cdp: CdpSession): Promise<string> {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'location.href',
    returnByValue: true,
  }).catch(() => undefined) as { result?: { value?: unknown } } | undefined
  return typeof result?.result?.value === 'string' ? result.result.value : ''
}

async function readTitle(cdp: CdpSession): Promise<string> {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true,
  }).catch(() => undefined) as { result?: { value?: unknown } } | undefined
  return typeof result?.result?.value === 'string' ? result.result.value : ''
}

/** Re-exported for the action dispatcher's file-input detection. */
export { attributeOf }
