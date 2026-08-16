import type { ReactNode } from "react"

export type WorkbenchDock = "right" | "bottom"
export type WorkbenchSplitDirection = "horizontal" | "vertical"

export type WorkbenchSplitNode =
  | { readonly kind: "pane"; readonly id: string }
  | {
    readonly kind: "split"
    readonly id: string
    readonly direction: WorkbenchSplitDirection
    readonly sizes: readonly number[]
    readonly children: readonly WorkbenchSplitNode[]
  }

export interface WorkbenchTarget {
  readonly path?: string
  readonly url?: string
  readonly data?: unknown
}

export interface WorkbenchPanelInstance {
  readonly id: string
  readonly type: string
  readonly title: string
  readonly dock: WorkbenchDock
  readonly paneId?: string
  readonly target?: WorkbenchTarget
}

export interface WorkbenchScope {
  readonly sessionId?: string
  /** Listed workspace root; covers host requests before the session is live. */
  readonly cwd?: string
}

export interface WorkbenchPanelProps {
  readonly instance: WorkbenchPanelInstance
  readonly scope: WorkbenchScope
  readonly visible: boolean
  readonly open: (type: string, options?: OpenPanelOptions) => string | undefined
  readonly close: (instanceId: string) => void
  readonly sessions?: {
    readonly list: {
      getSnapshot(): {
        readonly jobsBySession: Readonly<Record<string, readonly import('@deepseek-ai/dsh-client-runtime/client').JobView[]>>
        readonly subagentsByParent: Readonly<Record<string, import('@deepseek-ai/dsh-client-runtime/client').SubagentCatalogSnapshot>>
      }
      subscribe(listener: () => void): () => void
    }
    refreshSubagents(parentSessionId: string): Promise<void>
  }
}

export interface WorkbenchPanelDescriptor {
  readonly id: string
  readonly title: string | (() => string)
  readonly icon?: ReactNode | (() => ReactNode)
  readonly defaultDock: WorkbenchDock
  /**
   * Reuse an existing instance instead of opening a second one. The reuse scope
   * follows how precisely the caller located the request: a pane, a dock, or —
   * for programmatic calls that name neither — the whole session.
   */
  readonly singleton?: boolean
  /** When false, the panel can only be opened programmatically (e.g. file preview). */
  readonly addable?: boolean
  readonly order?: number
  readonly render: (props: WorkbenchPanelProps) => ReactNode
}

export interface OpenPanelOptions {
  readonly dock?: WorkbenchDock
  /** Pane to host the new tab. Also narrows singleton reuse to that pane. */
  readonly paneId?: string
  readonly title?: string
  readonly target?: WorkbenchTarget
  readonly instanceId?: string
  readonly sessionId?: string
}

export interface SessionWorkbenchState {
  readonly instances: readonly WorkbenchPanelInstance[]
  readonly active: Readonly<Partial<Record<WorkbenchDock, string>>>
  readonly activePane?: Readonly<Partial<Record<WorkbenchDock, string>>>
  readonly layouts?: Readonly<Partial<Record<WorkbenchDock, WorkbenchSplitNode>>>
}

export interface WorkbenchSnapshot {
  readonly sessionId?: string
  readonly session: SessionWorkbenchState
  readonly catalog: readonly WorkbenchPanelDescriptor[]
  readonly revision: number
}

export interface WorkbenchService {
  registerPanel(descriptor: WorkbenchPanelDescriptor): () => void
  open(type: string, options?: OpenPanelOptions): string | undefined
  close(instanceId: string, sessionId?: string): void
  closeMany(instanceIds: readonly string[], sessionId?: string): void
  activate(instanceId: string, sessionId?: string): void
  move(instanceId: string, dock: WorkbenchDock, sessionId?: string): void
  focusPane(paneId: string, sessionId?: string): void
  moveToPane(instanceId: string, paneId: string, beforeId?: string, sessionId?: string): void
  splitPane(paneId: string, direction: WorkbenchSplitDirection, after?: boolean, sessionId?: string): string | undefined
  resizeSplit(splitId: string, index: number, delta: number, sessionId?: string): void
  setSession(sessionId: string | undefined): void
  setDockOpen(dock: WorkbenchDock, open: boolean): void
  toggleDock(dock: WorkbenchDock): void
  snapshot(): WorkbenchSnapshot
  subscribe(listener: () => void): () => void
}
