import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createWorkbenchApi } from "../src/host-api.ts"
import type { SandboxMode, WorkbenchContext } from "../src/host-types.ts"

/**
 * Host context of a session rooted at `cwd`. Without a mounted `sandboxPolicy`
 * the workbench assumes the narrowest mode, so the workspace is the only
 * writable root; `mode` mounts a stub policy to exercise the wider modes.
 */
function context(cwd: string, mode?: SandboxMode): WorkbenchContext {
  return {
    sessions: { get: () => ({ header: { cwd } }) },
    webServer: { register: () => () => {}, registerUpgrade: () => () => {} },
    get: (name: string) => name === "sandboxPolicy" && mode !== undefined ? { resolve: () => ({ mode }) } : undefined,
    inject: () => {},
    effect: () => {},
  } as WorkbenchContext
}

/** Same host surface, but the named session is not live in the store yet. */
function detached(): WorkbenchContext {
  return {
    sessions: { get: () => undefined },
    webServer: { register: () => () => {}, registerUpgrade: () => () => {} },
    get: () => undefined,
    inject: () => {},
    effect: () => {},
  }
}

async function invoke(route: ReturnType<typeof createWorkbenchApi>, method: string, payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload))
  let status = 0
  let response = ""
  await route.handler({ method: "POST", url: `/cocode/workbench/api/${method}`, async *[Symbol.asyncIterator]() { yield body } }, {
    writeHead: value => { status = value },
    end: value => { response += String(value ?? "") },
  })
  return { status, value: JSON.parse(response) as { ok: boolean; value?: unknown; error?: { message: string } } }
}

describe("Cocode Workbench host API", () => {
  it("lists and reads files inside the session workspace", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    await writeFile(join(cwd, "note.txt"), "hello")
    const route = createWorkbenchApi(context(cwd))
    const tree = await invoke(route, "fs.tree", { sessionId: "s1" })
    expect(tree.value?.value).toMatchObject({ path: cwd })
    const read = await invoke(route, "fs.read", { sessionId: "s1", path: "note.txt" })
    expect(read.value?.value).toMatchObject({ kind: "text", content: "hello" })
  })

  it("reads outside the workspace but marks it unwritable", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    const outside = await mkdtemp(join(tmpdir(), "cocode-elsewhere-"))
    await writeFile(join(outside, "note.txt"), "hello")
    const route = createWorkbenchApi(context(cwd))
    const result = await invoke(route, "fs.read", { sessionId: "s1", path: join(outside, "note.txt") })
    expect(result.status).toBe(200)
    expect(result.value?.value).toMatchObject({ kind: "text", content: "hello", writable: false })
  })

  it("denies a write outside the writable roots of the current mode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    const outside = await mkdtemp(join(tmpdir(), "cocode-elsewhere-"))
    const route = createWorkbenchApi(context(cwd))
    const result = await invoke(route, "fs.write", { sessionId: "s1", path: join(outside, "note.txt"), content: "x" })
    expect(result.status).toBe(400)
    expect(result.value.error?.message).toMatch(/file access denied under read-only mode/)
  })

  it("keeps the workspace writable even under read-only", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    const route = createWorkbenchApi(context(cwd, "read-only"))
    const result = await invoke(route, "fs.write", { sessionId: "s1", path: "note.txt", content: "x" })
    expect(result.value?.value).toMatchObject({ written: true })
  })

  it("lifts the write fence under danger-full-access", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    const outside = await mkdtemp(join(tmpdir(), "cocode-elsewhere-"))
    const route = createWorkbenchApi(context(cwd, "danger-full-access"))
    const result = await invoke(route, "fs.write", { sessionId: "s1", path: join(outside, "note.txt"), content: "x" })
    expect(result.value?.value).toMatchObject({ written: true })
  })

  it("writes text through the explicit editor action", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    const path = join(cwd, "note.txt")
    await writeFile(path, "old")
    const route = createWorkbenchApi(context(cwd))
    const result = await invoke(route, "fs.write", { sessionId: "s1", path: "note.txt", content: "new" })
    expect(result.value?.value).toMatchObject({ written: true })
    await expect(readFile(path, "utf8")).resolves.toBe("new")
  })

  it("uses the caller-supplied cwd when the session is not live", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    await writeFile(join(cwd, "note.txt"), "hello")
    const route = createWorkbenchApi(detached())
    const result = await invoke(route, "fs.read", { sessionId: "s1", cwd, path: "note.txt" })
    expect(result.status).toBe(200)
    expect(result.value?.value).toMatchObject({ kind: "text", content: "hello" })
  })

  it("does not fence a named session against process.cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cocode-workbench-"))
    await writeFile(join(cwd, "note.txt"), "hello")
    const route = createWorkbenchApi(detached())
    const result = await invoke(route, "fs.read", { sessionId: "s1", path: join(cwd, "note.txt") })
    expect(result.status).toBe(400)
    expect(result.value.error?.message).toMatch(/not ready/)
  })
})
