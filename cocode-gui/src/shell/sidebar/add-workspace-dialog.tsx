/**
 * Registers a directory as a workspace.
 *
 * Two routes, chosen by capability rather than platform: the native picker where
 * the host allows it (loopback only), and a browsing list built from
 * `host.listDirectory` everywhere else. The browsing route is not a fallback of
 * last resort — it is the only one a remote browser session can have (RFC §4.2).
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, CornerLeftUp, Folder, FolderOpen } from 'lucide-react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogDescription, DialogTitle, Skeleton } from '@cocode/ui'
import type { DirectoryEntry } from '@cocode/gui-connection'
import { useConnectionService, useSessions } from '../runtime-context.tsx'

export function AddWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const connectionService = useConnectionService()
  const sessions = useSessions()
  const [path, setPath] = useState<string | undefined>(undefined)
  const [parent, setParent] = useState<string | undefined>(undefined)
  const [entries, setEntries] = useState<DirectoryEntry[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const browse = useCallback(async (next?: string) => {
    const transport = connectionService.activeTransport
    if (transport === undefined) return
    setEntries(undefined)
    setError(undefined)
    const result = await transport.call('host.listDirectory', next === undefined ? {} : { path: next })
    if (!result.ok) {
      setError(result.error.message)
      setEntries([])
      return
    }
    setPath(result.value.path)
    setParent(result.value.parent)
    // Host browse listings are directories only; `kind` is optional on older harness builds.
    setEntries(result.value.entries.filter(entry => entry.kind !== 'file'))
  }, [connectionService])

  useEffect(() => {
    if (!open) return
    void browse(undefined)
  }, [open, browse])

  const commit = async (target: string | undefined) => {
    if (target === undefined) return
    setBusy(true)
    const workspace = await sessions.createWorkspace(target)
    setBusy(false)
    if (workspace === undefined) return
    onOpenChange(false)
  }

  const useNativePicker = async () => {
    const transport = connectionService.activeTransport
    if (transport === undefined) return
    const result = await transport.call('host.pickDirectory', {})
    if (!result.ok) {
      // The host refuses the picker for a non-loopback caller; the browsing list
      // stays available, so say why rather than failing silently.
      setError(`系统目录对话框不可用：${result.error.message}`)
      return
    }
    if (result.value.path === null) return
    await commit(result.value.path)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(620px,calc(100vw-48px))]">
        <DialogBody>
        <DialogTitle>添加项目</DialogTitle>
        <DialogDescription>
          选择一个项目目录。同一项目下的任务会归到一组，面板布局也按项目分别记住。
        </DialogDescription>

        <div className="mt-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-sm bg-surface-sunken px-2 py-1.5 font-mono text-[11px]">
            {path ?? '…'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => { void useNativePicker() }}>
            <FolderOpen />
            系统对话框
          </Button>
        </div>

        <div className="mt-2 h-[280px] overflow-y-auto rounded-md border border-border">
          {parent === undefined
            ? null
            : (
                <button
                  type="button"
                  onClick={() => { void browse(parent) }}
                  className="flex min-h-[38px] w-full items-center gap-2 border-b border-border px-3 text-left text-[12px] hover:bg-surface-sunken"
                >
                  <CornerLeftUp className="size-4 text-muted-foreground" />
                  上一级
                </button>
              )}
          {entries === undefined
            ? <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-5" />)}</div>
            : entries.length === 0
              ? <p className="p-4 text-center text-[11px] text-muted-foreground">这个目录下没有子目录。</p>
              : entries.map(entry => (
                  <button
                    key={entry.path}
                    type="button"
                    onDoubleClick={() => { void browse(entry.path) }}
                    onClick={() => { void browse(entry.path) }}
                    className="flex min-h-[38px] w-full items-center gap-2 border-b border-border px-3 text-left text-[12px] last:border-b-0 hover:bg-surface-sunken"
                  >
                    <Folder className="size-4 shrink-0 text-warning" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" />
                  </button>
                ))}
        </div>

        {error === undefined ? null : <p className="mt-2 text-[11px] text-danger">{error}</p>}

        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" disabled={path === undefined || busy} onClick={() => { void commit(path) }}>
            使用当前目录
          </Button>
        </DialogActions>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
