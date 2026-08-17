import { baseName, joinPath } from "../paths.ts"
import { workbenchRequest } from "./runtime-api.ts"

export interface TreeEntry {
  readonly name: string
  readonly path: string
  readonly isDir: boolean
}

export async function createEntry(sessionId: string, dir: string, name: string, kind: "file" | "folder"): Promise<string> {
  const path = joinPath(dir, name)
  if (kind === "folder") await workbenchRequest("fs.mkdir", { sessionId, path })
  else await workbenchRequest("fs.write", { sessionId, path, content: "" })
  return path
}

export async function renameEntry(sessionId: string, path: string, name: string): Promise<string> {
  const result = await workbenchRequest<{ path: string }>("fs.rename", { sessionId, path, to: name })
  return result.path
}

export async function copyEntry(sessionId: string, from: string, dir: string): Promise<string> {
  const result = await workbenchRequest<{ path: string }>("fs.copy", { sessionId, from, to: joinPath(dir, baseName(from)) })
  return result.path
}

export async function moveEntry(sessionId: string, path: string, dir: string): Promise<string> {
  const result = await workbenchRequest<{ path: string }>("fs.rename", { sessionId, path, to: joinPath(dir, baseName(path)) })
  return result.path
}

export async function deleteEntry(sessionId: string, path: string): Promise<void> {
  await workbenchRequest("fs.delete", { sessionId, path })
}

export async function revealEntry(sessionId: string, path: string): Promise<void> {
  await workbenchRequest("fs.reveal", { sessionId, path })
}
