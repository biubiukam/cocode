import type {
  OpenPanelOptions,
  SessionWorkbenchState,
  WorkbenchDock,
  WorkbenchPanelDescriptor,
  WorkbenchPanelInstance,
  WorkbenchSplitDirection,
  WorkbenchSplitNode,
  WorkbenchService,
  WorkbenchSnapshot,
} from "./model.ts"

export interface WorkbenchLayoutFace {
  openWorkbench(dock: WorkbenchDock): void
  closeWorkbench(dock: WorkbenchDock): void
  toggleWorkbench?: (dock: WorkbenchDock) => void
}

const STORAGE_KEY = "cocode.workbench.v1"
const EMPTY_SESSION: SessionWorkbenchState = { instances: [], active: {} }
const DEFAULT_PANEL_BY_DOCK: Record<WorkbenchDock, string> = { right: "files", bottom: "terminal" }

interface PersistedDocument {
  readonly version: 1
  readonly sessions: Readonly<Record<string, SessionWorkbenchState>>
}

function sessionKey(sessionId: string | undefined): string {
  return sessionId ?? "$welcome"
}

function safeDocument(raw: string | null): PersistedDocument {
  if (raw === null) return { version: 1, sessions: {} }
  try {
    const value = JSON.parse(raw) as Partial<PersistedDocument>
    if (value.version !== 1 || value.sessions === null || typeof value.sessions !== "object") {
      return { version: 1, sessions: {} }
    }
    return { version: 1, sessions: value.sessions as Record<string, SessionWorkbenchState> }
  } catch {
    return { version: 1, sessions: {} }
  }
}

function titleOf(descriptor: WorkbenchPanelDescriptor): string {
  return typeof descriptor.title === "function" ? descriptor.title() : descriptor.title
}

function rootPaneId(key: string, dock: WorkbenchDock): string {
  return `root:${dock}:${key}`
}

function splitId(key: string): string {
  return `split:${key}:${Date.now().toString(36)}`
}

function paneIdOf(instance: WorkbenchPanelInstance, key: string): string {
  return instance.paneId ?? rootPaneId(key, instance.dock)
}

function findNode(node: WorkbenchSplitNode, id: string): WorkbenchSplitNode | undefined {
  if (node.id === id) return node
  if (node.kind === "split") {
    for (const child of node.children) {
      const found = findNode(child, id)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function updateNode(node: WorkbenchSplitNode, id: string, update: (node: WorkbenchSplitNode) => WorkbenchSplitNode): WorkbenchSplitNode {
  if (node.id === id) return update(node)
  if (node.kind === "pane") return node
  return { ...node, children: node.children.map(child => updateNode(child, id, update)) }
}

function collectPaneIds(node: WorkbenchSplitNode, into: Set<string>): void {
  if (node.kind === "pane") {
    into.add(node.id)
    return
  }
  for (const child of node.children) collectPaneIds(child, into)
}

/** 只接受属于该 dock 的 pane，陈旧或跨 dock 的请求回退到 dock 的活动 pane。 */
function resolvePane(state: SessionWorkbenchState, key: string, dock: WorkbenchDock, requested: string | undefined): string {
  const fallback = state.activePane?.[dock] ?? rootPaneId(key, dock)
  const root = state.layouts?.[dock]
  if (requested === undefined || root === undefined) return fallback
  const ids = new Set<string>()
  collectPaneIds(root, ids)
  return ids.has(requested) ? requested : fallback
}

function normalizeSession(state: SessionWorkbenchState, key: string): SessionWorkbenchState {
  const layouts: Partial<Record<WorkbenchDock, WorkbenchSplitNode>> = { ...(state.layouts ?? {}) }
  const activePane: Partial<Record<WorkbenchDock, string>> = { ...(state.activePane ?? {}) }
  const panes: Partial<Record<WorkbenchDock, { ids: Set<string>; fallback: string }>> = {}
  for (const dock of ["right", "bottom"] as const) {
    const root = rootPaneId(key, dock)
    layouts[dock] ??= { kind: "pane", id: root }
    const ids = new Set<string>()
    collectPaneIds(layouts[dock]!, ids)
    // Panes that the layout tree no longer contains fall back to a surviving
    // pane, so pruning a split never strands a tab outside every pane.
    const fallback = ids.has(root) ? root : ids.values().next().value ?? root
    panes[dock] = { ids, fallback }
    if (activePane[dock] === undefined || !ids.has(activePane[dock]!)) activePane[dock] = fallback
  }
  const instances = state.instances.map(instance => {
    const paneId = paneIdOf(instance, key)
    const pane = panes[instance.dock]
    return { ...instance, paneId: pane === undefined || pane.ids.has(paneId) ? paneId : pane.fallback }
  })
  return { ...state, instances, activePane, layouts }
}

function pruneNode(node: WorkbenchSplitNode, keep: (paneId: string) => boolean): WorkbenchSplitNode | undefined {
  if (node.kind === "pane") return keep(node.id) ? node : undefined
  const kept = node.children
    .map((child, index) => ({ child: pruneNode(child, keep), size: node.sizes[index] ?? 1 }))
    .filter((entry): entry is { child: WorkbenchSplitNode; size: number } => entry.child !== undefined)
  if (kept.length === 0) return undefined
  if (kept.length === 1) return kept[0]!.child
  const total = kept.reduce((sum, entry) => sum + entry.size, 0)
  const scale = total === 0 ? 1 : node.sizes.reduce((sum, size) => sum + size, 0) / total
  return { ...node, sizes: kept.map(entry => entry.size * scale), children: kept.map(entry => entry.child) }
}

/** Drop panes that no longer hold a tab; the dock root pane stays as the empty-state host. */
function prunePanes(state: SessionWorkbenchState, key: string): SessionWorkbenchState {
  const occupied = new Set(state.instances.map(instance => paneIdOf(instance, key)))
  const layouts: Partial<Record<WorkbenchDock, WorkbenchSplitNode>> = { ...state.layouts }
  for (const dock of ["right", "bottom"] as const) {
    const root = layouts[dock]
    if (root === undefined) continue
    const rootPane = rootPaneId(key, dock)
    layouts[dock] = pruneNode(root, paneId => paneId === rootPane || occupied.has(paneId)) ?? { kind: "pane", id: rootPane }
  }
  return { ...state, layouts }
}

/** Cocode-owned workbench state machine. It has no React or Cordis dependency. */
export class WorkbenchController implements WorkbenchService {
  readonly #layout: WorkbenchLayoutFace
  readonly #storage: Pick<Storage, "getItem" | "setItem">
  readonly #catalog = new Map<string, WorkbenchPanelDescriptor>()
  readonly #listeners = new Set<() => void>()
  #sessions: Record<string, SessionWorkbenchState>
  #sessionId: string | undefined
  #revision = 0
  #sequence = 0
  #snapshotCache: WorkbenchSnapshot
  #dockOpen: Record<WorkbenchDock, boolean> = { right: false, bottom: false }

  constructor(layout: WorkbenchLayoutFace, storage: Pick<Storage, "getItem" | "setItem">) {
    this.#layout = layout
    this.#storage = storage
    this.#sessions = { ...safeDocument(storage.getItem(STORAGE_KEY)).sessions }
    this.#snapshotCache = {
      sessionId: undefined,
      session: EMPTY_SESSION,
      catalog: [],
      revision: 0,
    }
  }

  registerPanel(descriptor: WorkbenchPanelDescriptor): () => void {
    if (descriptor.id.trim() === "") throw new Error("workbench panel id must not be empty")
    if (this.#catalog.has(descriptor.id)) throw new Error(`workbench panel "${descriptor.id}" already registered`)
    this.#catalog.set(descriptor.id, descriptor)
    this.#publish(false)
    return () => {
      if (this.#catalog.delete(descriptor.id)) this.#publish(false)
    }
  }

  open(type: string, options: OpenPanelOptions = {}): string | undefined {
    const descriptor = this.#catalog.get(type)
    if (descriptor === undefined) return undefined
    const key = sessionKey(options.sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    if (descriptor.singleton) {
      // 复用范围跟随调用方给出的位置精度：从某个 pane 的加号打开，就只复用该
      // pane 里的实例；只给了 dock 就限定在该 dock。这样「在哪里点，就在哪里
      // 出现」，而未指名位置的程序化调用仍然全局复用，不会开出重复面板。
      const existing = current.instances.find(instance => instance.type === type
        && (options.dock === undefined || instance.dock === options.dock)
        && (options.paneId === undefined || paneIdOf(instance, key) === options.paneId))
      if (existing !== undefined) {
        this.#sessions[key] = {
          ...current,
          active: { ...current.active, [existing.dock]: existing.id },
          activePane: { ...current.activePane, [existing.dock]: paneIdOf(existing, key) },
        }
        this.#layout.openWorkbench(existing.dock)
        this.#publish()
        return existing.id
      }
    }
    const dock = options.dock ?? descriptor.defaultDock
    const paneId = resolvePane(current, key, dock, options.paneId)
    const id = options.instanceId ?? `${type}:${Date.now().toString(36)}:${(++this.#sequence).toString(36)}`
    if (current.instances.some(instance => instance.id === id)) {
      this.activate(id, options.sessionId)
      return id
    }
    const instance: WorkbenchPanelInstance = {
      id,
      type,
      title: options.title ?? titleOf(descriptor),
      dock,
      paneId,
      ...(options.target === undefined ? {} : { target: options.target }),
    }
    this.#sessions[key] = {
      instances: [...current.instances, instance],
      active: { ...current.active, [dock]: id },
      activePane: { ...current.activePane, [dock]: paneId },
      layouts: current.layouts,
    }
    this.#layout.openWorkbench(dock)
    this.#publish()
    return id
  }

  close(instanceId: string, sessionId?: string): void {
    this.closeMany([instanceId], sessionId)
  }

  /** Single commit for bulk tab closing (close others / to the right / all). */
  closeMany(instanceIds: readonly string[], sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const closing = new Set(instanceIds)
    const removed = current.instances.filter(instance => closing.has(instance.id))
    if (removed.length === 0) return
    const instances = current.instances.filter(instance => !closing.has(instance.id))
    const active = { ...current.active }
    for (const dock of new Set(removed.map(instance => instance.dock))) {
      const remaining = instances.filter(instance => instance.dock === dock)
      if (remaining.length === 0) {
        delete active[dock]
        this.#layout.closeWorkbench(dock)
        continue
      }
      const activeId = active[dock]
      if (activeId === undefined || closing.has(activeId)) active[dock] = remaining.at(-1)!.id
    }
    this.#sessions[key] = prunePanes({ ...current, instances, active }, key)
    this.#publish()
  }

  activate(instanceId: string, sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const instance = current.instances.find(candidate => candidate.id === instanceId)
    if (instance === undefined) return
    this.#sessions[key] = {
      ...current,
      active: { ...current.active, [instance.dock]: instance.id },
      activePane: { ...current.activePane, [instance.dock]: paneIdOf(instance, key) },
    }
    this.#layout.openWorkbench(instance.dock)
    this.#publish()
  }

  move(instanceId: string, dock: WorkbenchDock, sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const index = current.instances.findIndex(instance => instance.id === instanceId)
    if (index < 0) return
    const source = current.instances[index]!
    if (source.dock === dock) return
    const targetPane = current.activePane?.[dock] ?? rootPaneId(key, dock)
    const instances = current.instances.map(instance => instance.id === instanceId ? { ...instance, dock, paneId: targetPane } : instance)
    const active = { ...current.active, [dock]: instanceId }
    const sourceRemaining = instances.filter(instance => instance.dock === source.dock)
    if (active[source.dock] === instanceId) active[source.dock] = sourceRemaining.at(-1)?.id
    if (active[source.dock] === undefined) {
      delete active[source.dock]
      this.#layout.closeWorkbench(source.dock)
    }
    this.#sessions[key] = prunePanes({ ...current, instances, active, activePane: { ...current.activePane, [dock]: targetPane } }, key)
    this.#layout.openWorkbench(dock)
    this.#publish()
  }

  reorder(instanceId: string, beforeId?: string, sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const sourceIndex = current.instances.findIndex(instance => instance.id === instanceId)
    if (sourceIndex < 0) return
    const source = current.instances[sourceIndex]!
    const without = current.instances.filter(instance => instance.id !== instanceId)
    const targetIndex = beforeId === undefined
      ? without.length
      : without.findIndex(instance => instance.id === beforeId && instance.dock === source.dock)
    const insertAt = targetIndex < 0 ? without.length : targetIndex
    const instances = [...without.slice(0, insertAt), source, ...without.slice(insertAt)]
    if (instances.every((instance, index) => instance.id === current.instances[index]?.id)) return
    this.#sessions[key] = { ...current, instances }
    this.#publish()
  }

  focusPane(paneId: string, sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const dock = (Object.entries(current.layouts ?? {}) as [WorkbenchDock, WorkbenchSplitNode | undefined][])
      .find(([, root]) => root !== undefined && findNode(root, paneId) !== undefined)?.[0]
    if (dock === undefined || current.activePane?.[dock] === paneId) return
    this.#sessions[key] = { ...current, activePane: { ...current.activePane, [dock]: paneId } }
    this.#publish()
  }

  moveToPane(instanceId: string, paneId: string, beforeId?: string, sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const source = current.instances.find(instance => instance.id === instanceId)
    if (source === undefined) return
    const dock = (Object.entries(current.layouts ?? {}) as [WorkbenchDock, WorkbenchSplitNode | undefined][])
      .find(([, root]) => root !== undefined && findNode(root, paneId) !== undefined)?.[0]
    if (dock === undefined) return
    const moved = current.instances.map(instance => instance.id === instanceId
      ? { ...instance, dock, paneId }
      : instance)
    const without = moved.filter(instance => instance.id !== instanceId)
    const targetIndex = beforeId === undefined
      ? without.length
      : without.findIndex(instance => instance.id === beforeId)
    const insertAt = targetIndex < 0 ? without.length : targetIndex
    const instances = [...without.slice(0, insertAt), moved.find(instance => instance.id === instanceId)!, ...without.slice(insertAt)]
    this.#sessions[key] = prunePanes({
      ...current,
      instances,
      active: { ...current.active, [dock]: instanceId },
      activePane: { ...current.activePane, [dock]: paneId },
    }, key)
    this.#layout.openWorkbench(dock)
    if (source.dock !== dock && current.instances.filter(instance => instance.dock === source.dock && instance.id !== instanceId).length === 0) {
      this.#layout.closeWorkbench(source.dock)
    }
    this.#publish()
  }

  splitPane(paneId: string, direction: WorkbenchSplitDirection, after = true, sessionId?: string): string | undefined {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const entry = (Object.entries(current.layouts ?? {}) as [WorkbenchDock, WorkbenchSplitNode | undefined][])
      .find(([, root]) => root !== undefined && findNode(root, paneId) !== undefined)
    if (entry === undefined || entry[1] === undefined) return undefined
    const [dock, root] = entry
    const newPane = `pane:${key}:${dock}:${(++this.#sequence).toString(36)}`
    const replacement: WorkbenchSplitNode = {
      kind: "split",
      id: splitId(`${key}:${this.#sequence}`),
      direction,
      sizes: [0.5, 0.5],
      children: after
        ? [{ kind: "pane", id: paneId }, { kind: "pane", id: newPane }]
        : [{ kind: "pane", id: newPane }, { kind: "pane", id: paneId }],
    }
    const layouts = { ...current.layouts, [dock]: updateNode(root, paneId, () => replacement) }
    this.#sessions[key] = { ...current, layouts, activePane: { ...current.activePane, [dock]: newPane } }
    this.#publish()
    return newPane
  }

  resizeSplit(splitIdValue: string, index: number, delta: number, sessionId?: string): void {
    const key = sessionKey(sessionId ?? this.#sessionId)
    const current = normalizeSession(this.#sessions[key] ?? EMPTY_SESSION, key)
    const entry = (Object.entries(current.layouts ?? {}) as [WorkbenchDock, WorkbenchSplitNode | undefined][])
      .find(([, root]) => root !== undefined && findNode(root, splitIdValue)?.kind === "split")
    if (entry === undefined || entry[1] === undefined) return
    const [dock, root] = entry
    const nextRoot = updateNode(root, splitIdValue, node => {
      if (node.kind !== "split" || index < 0 || index >= node.sizes.length - 1) return node
      const sizes = [...node.sizes]
      const total = sizes[index]! + sizes[index + 1]!
      const minimum = Math.min(0.15, total / 2)
      const left = Math.max(minimum, Math.min(total - minimum, sizes[index]! + delta))
      sizes[index] = left
      sizes[index + 1] = total - left
      return { ...node, sizes }
    })
    this.#sessions[key] = { ...current, layouts: { ...current.layouts, [dock]: nextRoot } }
    this.#publish()
  }

  setSession(sessionId: string | undefined): void {
    if (this.#sessionId === sessionId) return
    this.#sessionId = sessionId
    this.#publish(false)
  }

  /** Mirror layout visibility so toggle can distinguish open-empty from closed. */
  setDockOpen(dock: WorkbenchDock, open: boolean): void {
    this.#dockOpen[dock] = open
  }

  /** Toggle a dock; the first open seeds Files (right) or Terminal (bottom). */
  toggleDock(dock: WorkbenchDock): void {
    const instances = this.snapshot().session.instances.filter(instance => instance.dock === dock)
    const opening = !this.#dockOpen[dock]
    if (opening && instances.length === 0) {
      this.open(DEFAULT_PANEL_BY_DOCK[dock], { dock })
      return
    }
    if (this.#layout.toggleWorkbench !== undefined) this.#layout.toggleWorkbench(dock)
    else if (opening) this.#layout.openWorkbench(dock)
    else this.#layout.closeWorkbench(dock)
  }

  snapshot = (): WorkbenchSnapshot => this.#snapshotCache

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #publish(persist = true): void {
    this.#revision += 1
    this.#snapshotCache = {
      sessionId: this.#sessionId,
      session: normalizeSession(this.#sessions[sessionKey(this.#sessionId)] ?? EMPTY_SESSION, sessionKey(this.#sessionId)),
      catalog: [...this.#catalog.values()].sort((left, right) => (left.order ?? 100) - (right.order ?? 100)),
      revision: this.#revision,
    }
    if (persist) {
      this.#storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, sessions: this.#sessions } satisfies PersistedDocument))
    }
    for (const listener of [...this.#listeners]) listener()
  }
}
