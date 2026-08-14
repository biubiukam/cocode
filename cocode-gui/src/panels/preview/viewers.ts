/**
 * Preview file-viewer registry (RFC dock-panel-depth §4.1).
 * Lives in the presentation layer because descriptors carry React components.
 */

import type { ComponentType } from 'react'

export type FileViewerProps = {
  path: string
  workspaceId: string
  text?: string
  base64?: string
  byteLength?: number
  draft?: string
  dirty?: boolean
  onDraftChange?(next: string): void
  onSave?(): void
  onAppendSelection?(text: string): void
}

export type FileViewerDescriptor = {
  id: string
  exts?: readonly string[]
  priority?: number
  detect?: (path: string, head?: string) => boolean
  binary?: boolean
  component: ComponentType<FileViewerProps>
}

export class FileViewerRegistry {
  private readonly viewers = new Map<string, FileViewerDescriptor>()

  register(descriptor: FileViewerDescriptor): () => void {
    this.viewers.set(descriptor.id, descriptor)
    return () => {
      if (this.viewers.get(descriptor.id) === descriptor) this.viewers.delete(descriptor.id)
    }
  }

  list(): FileViewerDescriptor[] {
    return [...this.viewers.values()].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
  }

  match(path: string, head?: string): FileViewerDescriptor | undefined {
    const ext = extensionOf(path)
    const ranked = this.list()
    for (const viewer of ranked) {
      if (viewer.detect?.(path, head)) return viewer
    }
    for (const viewer of ranked) {
      const exts = viewer.exts
      if (exts === undefined || exts.length === 0) continue
      if (ext !== undefined && exts.includes(ext)) return viewer
    }
    return ranked.find(viewer => viewer.exts?.length === 0)
  }
}

function extensionOf(path: string): string | undefined {
  const base = path.split('/').pop() ?? path
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot + 1).toLowerCase()
}

export const fileViewerRegistry = new FileViewerRegistry()
