import { describe, expect, it } from "vitest"
import { WorkbenchController } from "../src/client/controller.ts"

function harness() {
  const opened: string[] = []
  const closed: string[] = []
  const values = new Map<string, string>()
  const controller = new WorkbenchController({
    openWorkbench: (dock: "right" | "bottom") => { opened.push(dock) },
    closeWorkbench: (dock: "right" | "bottom") => { closed.push(dock) },
  }, {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  })
  return { controller, opened, closed, values }
}

describe("WorkbenchController", () => {
  it("registers panels and opens a singleton once", () => {
    const { controller, opened } = harness()
    controller.registerPanel({ id: "files", title: "Files", defaultDock: "right", singleton: true, render: () => null })
    controller.setSession("s1")
    const first = controller.open("files")
    const second = controller.open("files")
    expect(first).toBe(second)
    expect(controller.snapshot().session.instances).toHaveLength(1)
    expect(opened).toEqual(["right", "right"])
  })

  it("moves a panel and closes an empty source dock", () => {
    const { controller, opened, closed } = harness()
    controller.registerPanel({ id: "terminal", title: "Terminal", defaultDock: "bottom", render: () => null })
    controller.setSession("s1")
    const id = controller.open("terminal")!
    controller.move(id, "right")
    expect(controller.snapshot().session.instances[0]?.dock).toBe("right")
    expect(opened).toEqual(["bottom", "right"])
    expect(closed).toEqual(["bottom"])
  })

  it("keeps session workspaces isolated and persists the new document", () => {
    const { controller, values } = harness()
    controller.registerPanel({ id: "jobs", title: "Jobs", defaultDock: "bottom", singleton: true, render: () => null })
    controller.setSession("a")
    controller.open("jobs")
    controller.setSession("b")
    expect(controller.snapshot().session.instances).toEqual([])
    controller.open("jobs")
    expect(JSON.parse(values.get("cocode.workbench.v1") ?? "{}").version).toBe(1)
  })

  it("reorders tabs without crossing docks", () => {
    const { controller } = harness()
    controller.registerPanel({ id: "files", title: "Files", defaultDock: "right", render: () => null })
    controller.registerPanel({ id: "git", title: "Git", defaultDock: "right", render: () => null })
    controller.registerPanel({ id: "terminal", title: "Terminal", defaultDock: "bottom", render: () => null })
    controller.setSession("s1")
    const files = controller.open("files")!
    const git = controller.open("git")!
    const terminal = controller.open("terminal")!
    controller.reorder(git, files)
    expect(controller.snapshot().session.instances.map(instance => instance.id)).toEqual([git, files, terminal])
    controller.reorder(terminal, files)
    expect(controller.snapshot().session.instances.map(instance => instance.id)).toEqual([git, files, terminal])
    controller.reorder(git)
    expect(controller.snapshot().session.instances.map(instance => instance.id)).toEqual([files, terminal, git])
  })

  it("splits a pane, moves a tab into it, and resizes the divider", () => {
    const { controller } = harness()
    controller.registerPanel({ id: "files", title: "Files", defaultDock: "right", render: () => null })
    controller.registerPanel({ id: "git", title: "Git", defaultDock: "right", render: () => null })
    controller.setSession("s1")
    const files = controller.open("files")!
    const git = controller.open("git")!
    const root = controller.snapshot().session.layouts?.right
    expect(root?.kind).toBe("pane")
    const pane = controller.splitPane(root!.id, "horizontal")!
    controller.moveToPane(git, pane)
    const split = controller.snapshot().session.layouts?.right
    expect(split).toMatchObject({ kind: "split", direction: "horizontal", sizes: [0.5, 0.5] })
    expect(controller.snapshot().session.instances.find(instance => instance.id === files)?.paneId).toBe(root!.id)
    expect(controller.snapshot().session.instances.find(instance => instance.id === git)?.paneId).toBe(pane)
    if (split?.kind !== "split") throw new Error("expected split")
    controller.resizeSplit(split.id, 0, 0.1)
    expect(controller.snapshot().session.layouts?.right).toMatchObject({ sizes: [0.6, 0.4] })
  })

  it("moves a tab between dock pane trees and persists the pane assignment", () => {
    const { controller, values } = harness()
    controller.registerPanel({ id: "terminal", title: "Terminal", defaultDock: "bottom", render: () => null })
    controller.setSession("s1")
    const terminal = controller.open("terminal")!
    const rightRoot = controller.snapshot().session.layouts?.right
    if (rightRoot === undefined) throw new Error("missing right root")
    controller.moveToPane(terminal, rightRoot.id)
    expect(controller.snapshot().session.instances[0]).toMatchObject({ id: terminal, dock: "right", paneId: rightRoot.id })
    const persisted = JSON.parse(values.get("cocode.workbench.v1") ?? "{}")
    expect(persisted.sessions.s1.instances[0]).toMatchObject({ dock: "right", paneId: rightRoot.id })
  })

  it("opens the default panel when toggling an empty dock", () => {
    const { controller, opened } = harness()
    controller.registerPanel({ id: "files", title: "Files", defaultDock: "right", singleton: true, render: () => null })
    controller.registerPanel({ id: "terminal", title: "Terminal", defaultDock: "bottom", render: () => null })
    controller.setSession("s1")
    controller.toggleDock("right")
    expect(controller.snapshot().session.instances).toMatchObject([{ type: "files", dock: "right" }])
    expect(opened).toEqual(["right"])
    controller.toggleDock("bottom")
    expect(controller.snapshot().session.instances).toMatchObject([
      { type: "files", dock: "right" },
      { type: "terminal", dock: "bottom" },
    ])
    expect(opened).toEqual(["right", "bottom"])
  })

  it("closes an empty open dock on toggle", () => {
    const { controller, opened, closed } = harness()
    controller.registerPanel({ id: "files", title: "Files", defaultDock: "right", singleton: true, render: () => null })
    controller.setSession("s1")
    controller.setDockOpen("right", true)
    controller.toggleDock("right")
    expect(controller.snapshot().session.instances).toEqual([])
    expect(closed).toEqual(["right"])
    expect(opened).toEqual([])
  })

  it("closes a visible dock that has no tabs", () => {
    const { controller, closed } = harness()
    controller.setSession("s1")
    controller.setDockOpen("right", true)
    controller.closeDockIfEmpty("right")
    expect(closed).toEqual(["right"])
  })

  it("reuses an existing preview tab for the same file path", () => {
    const { controller, opened } = harness()
    controller.registerPanel({ id: "preview", title: "Preview", defaultDock: "right", render: () => null })
    controller.setSession("s1")
    const first = controller.open("preview", { title: "about-me.html", target: { path: "/ws/about-me.html" } })
    const second = controller.open("preview", { title: "about-me.html", target: { path: "/ws/about-me.html" } })
    expect(first).toBe(second)
    expect(controller.snapshot().session.instances).toHaveLength(1)
    expect(controller.snapshot().session.active.right).toBe(first)
    expect(opened).toEqual(["right", "right"])
  })

  it("keeps separate preview tabs for the same path with different target data", () => {
    const { controller } = harness()
    controller.registerPanel({ id: "preview", title: "Preview", defaultDock: "right", render: () => null })
    controller.setSession("s1")
    const file = controller.open("preview", { target: { path: "/ws/app.ts" } })
    const staged = controller.open("preview", {
      target: { path: "/ws/app.ts", data: { kind: "diff", group: "index" } },
    })
    const worktree = controller.open("preview", {
      target: { path: "/ws/app.ts", data: { kind: "diff", group: "worktree" } },
    })
    expect(new Set([file, staged, worktree]).size).toBe(3)
    expect(controller.snapshot().session.instances).toHaveLength(3)
  })

  it("refreshes a tab without changing its identity", () => {
    const { controller } = harness()
    controller.registerPanel({ id: "preview", title: "Preview", defaultDock: "right", render: () => null })
    controller.setSession("s1")
    const id = controller.open("preview", { target: { path: "/ws/report.docx" } })!
    expect(controller.snapshot().session.instances[0]?.refreshToken).toBeUndefined()
    controller.refresh(id)
    expect(controller.snapshot().session.instances[0]).toMatchObject({ id, refreshToken: 1 })
    controller.refresh(id)
    expect(controller.snapshot().session.instances[0]?.refreshToken).toBe(2)
  })
})
