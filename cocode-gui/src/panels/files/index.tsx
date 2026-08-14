/**
 * Files: lazy workspace tree with @-mention and path actions (RFC dock-panel-depth §3.1).
 *
 * Reads only — clicks open Preview; writes stay on Preview / explicit create-delete menus.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AtSign,
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Skeleton,
  Tooltip,
  cn,
} from '@cocode/ui'
import type { FsEntry, FsListing } from '@cocode/gui-connection'
import { definePanel, type PanelProps } from '../types.ts'
import { isLoopbackOrigin } from '../../host/bridge.ts'
import { appendComposerDraft } from '../../runtime/composer/draft.ts'
import {
  useActiveSession,
  useConnection,
  useConnectionService,
  useLayoutActions,
  useSessionDirectory,
  useSessionSnapshot,
} from '../../shell/runtime-context.tsx'
import { useToast } from '../../shell/overlay/toast.tsx'
import { buildFileDiff } from '../../views/diff.ts'
import type { ConversationNode } from '../../runtime/index.ts'

type DiffStat = { additions: number; deletions: number }

type CreateKind = 'file' | 'directory'

type CreateDialog = {
  parentPath: string
  kind: CreateKind
}

type DeleteDialog = {
  path: string
  name: string
  kind: FsEntry['kind']
}

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extensionGlyph(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return '·'
  return name.slice(dot + 1, dot + 3).toUpperCase()
}

/** Prefer path relative to listing.root; otherwise basename. */
function toRelativePath(root: string, abs: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`
  if (abs === root) return ''
  if (abs.startsWith(prefix)) return abs.slice(prefix.length)
  return abs.split('/').pop() ?? abs
}

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function diffStatsFromNodes(nodes: readonly ConversationNode[]): Map<string, DiffStat> {
  const stats = new Map<string, DiffStat>()
  for (const node of nodes) {
    if (node.kind !== 'tool') continue
    const view = node.resultView?.card === 'diff'
      ? node.resultView
      : node.callView?.card === 'diff' ? node.callView : undefined
    if (view === undefined) continue
    for (const diff of view.diffs) {
      const built = buildFileDiff(diff.path, diff.oldText, diff.newText)
      const previous = stats.get(diff.path) ?? { additions: 0, deletions: 0 }
      stats.set(diff.path, {
        additions: previous.additions + built.additions,
        deletions: previous.deletions + built.deletions,
      })
    }
  }
  return stats
}

function statFor(path: string, stats: Map<string, DiffStat>): DiffStat | undefined {
  const direct = stats.get(path)
  if (direct !== undefined) return direct
  for (const [key, value] of stats) {
    if (path === key || path.endsWith(`/${key}`) || key.endsWith(`/${path}`)) return value
  }
  return undefined
}

function triggerBrowserDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes])
}

function FilesPanel({ sizeClass, active, markUnread }: PanelProps) {
  const connectionService = useConnectionService()
  const connection = useConnection()
  const directory = useSessionDirectory()
  const actions = useLayoutActions()
  const session = useActiveSession()
  const snapshot = useSessionSnapshot(session)
  const toast = useToast()
  const workspaceId = directory.activeWorkspaceId
  const privileged = isLoopbackOrigin(connection.baseUrl)

  const [root, setRoot] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [children, setChildren] = useState<Map<string, FsEntry[]>>(() => new Map())
  const [tick, setTick] = useState(0)
  const [loadingRoot, setLoadingRoot] = useState(false)
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | undefined>(undefined)
  const [createDialog, setCreateDialog] = useState<CreateDialog | undefined>(undefined)
  const [createName, setCreateName] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const seenDiffs = useRef(new Set<string>())

  const stats = useMemo(() => diffStatsFromNodes(snapshot?.nodes ?? []), [snapshot?.nodes])
  const compact = sizeClass === 'compact'
  const hasSession = session !== undefined

  useEffect(() => {
    if (active) {
      seenDiffs.current = new Set(stats.keys())
      return
    }
    for (const key of stats.keys()) {
      if (seenDiffs.current.has(key)) continue
      markUnread()
      break
    }
  }, [active, stats, markUnread])

  const loadDir = useCallback(async (path: string | undefined, signal?: AbortSignal): Promise<FsListing | undefined> => {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return undefined
    const result = await transport.call(
      'fs.list',
      path === undefined ? { workspaceId } : { workspaceId, path },
      signal === undefined ? undefined : { signal },
    )
    if (signal?.aborted) return undefined
    if (!result.ok) {
      setError(result.error.message)
      toast.push('warning', result.error.message)
      return undefined
    }
    setError(undefined)
    return result.value
  }, [connectionService, workspaceId, toast])

  // Root listing — path undefined; cache under listing.path.
  // RFC §2.2: no file watcher; refresh manually or via `tick` after mutations.
  useEffect(() => {
    if (!privileged || workspaceId === undefined) {
      setRoot(undefined)
      setChildren(new Map())
      setExpanded(new Set())
      setError(undefined)
      return
    }
    const controller = new AbortController()
    setLoadingRoot(true)
    void loadDir(undefined, controller.signal)
      .then((listing) => {
        if (listing === undefined || controller.signal.aborted) return
        setRoot(listing.root)
        setChildren((prev) => {
          const next = new Map(prev)
          next.set(listing.path, listing.entries.filter(entry => !entry.hidden))
          return next
        })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRoot(false)
      })
    return () => controller.abort()
  }, [privileged, workspaceId, tick, loadDir])

  async function ensureChildren(dirPath: string, force = false): Promise<void> {
    if (!force && children.has(dirPath)) return
    setLoadingPaths((prev) => new Set(prev).add(dirPath))
    const listing = await loadDir(dirPath)
    setLoadingPaths((prev) => {
      const next = new Set(prev)
      next.delete(dirPath)
      return next
    })
    if (listing === undefined) return
    setChildren((prev) => {
      const next = new Map(prev)
      next.set(dirPath, listing.entries.filter(entry => !entry.hidden))
      return next
    })
  }

  function toggleExpand(dirPath: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) {
        next.delete(dirPath)
        return next
      }
      next.add(dirPath)
      return next
    })
    if (!expanded.has(dirPath)) void ensureChildren(dirPath)
  }

  function refresh(): void {
    setChildren(new Map())
    setExpanded(new Set())
    setTick(value => value + 1)
  }

  async function copyText(label: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toast.push('success', `已复制${label}`)
    }
    catch {
      toast.push('warning', '复制失败')
    }
  }

  async function downloadEntry(entry: FsEntry): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    setBusy(true)
    const result = await transport.call('fs.read', {
      workspaceId,
      path: entry.path,
      includeBase64: true,
    })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      return
    }
    const value = result.value
    if (value.kind === 'text') {
      triggerBrowserDownload(entry.name, new Blob([value.text], { type: 'text/plain;charset=utf-8' }))
      return
    }
    if (value.base64 === undefined) {
      toast.push('warning', '无法下载该二进制文件')
      return
    }
    triggerBrowserDownload(entry.name, base64ToBlob(value.base64))
  }

  async function submitCreate(): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined || createDialog === undefined) return
    const name = createName.trim()
    if (name === '') return
    const parentPath = createDialog.parentPath
    const kind = createDialog.kind
    setBusy(true)
    const result = await transport.call('fs.create', {
      workspaceId,
      path: parentPath,
      name,
      kind,
    })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      return
    }
    setCreateDialog(undefined)
    setCreateName('')
    setExpanded(prev => new Set(prev).add(parentPath))
    void ensureChildren(parentPath, true)
    toast.push('success', kind === 'directory' ? '已创建文件夹' : '已创建文件')
  }

  async function submitDelete(): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined || deleteDialog === undefined) return
    setBusy(true)
    const result = await transport.call('fs.remove', { workspaceId, path: deleteDialog.path })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      return
    }
    const removedPath = deleteDialog.path
    const parent = removedPath.includes('/')
      ? removedPath.slice(0, removedPath.lastIndexOf('/')) || (root ?? '')
      : (root ?? '')
    setDeleteDialog(undefined)
    setChildren((prev) => {
      const next = new Map(prev)
      next.delete(removedPath)
      return next
    })
    if (parent === root || parent === '' || root === undefined) {
      setTick(value => value + 1)
    }
    else {
      void ensureChildren(parent, true)
    }
    toast.push('success', '已删除')
  }

  if (workspaceId === undefined) {
    return <EmptyState icon={Folder} title="没有选中的项目" description="从左侧选择一个项目后，这里会列出它的文件。" className="m-4" />
  }
  if (!privileged) {
    return (
      <EmptyState
        icon={Folder}
        title="远程连接无法浏览文件"
        description="工作区文件读取被 harness 限定在 loopback 同源。改用本机运行或经隧道同源访问即可恢复。"
        className="m-4"
      />
    )
  }

  const rootKey = root
  const rootEntries = rootKey === undefined ? [] : (children.get(rootKey) ?? [])

  return (
    <>
      <div className="panel-body flex h-full min-h-0 flex-col">
        <div className="file-list-toolbar shrink-0">
          <div className="file-list-breadcrumb">
            <span aria-hidden>⌘</span>
            <span className="context-divider">/</span>
            <strong>{root === undefined ? '工作区' : basename(root)}</strong>
          </div>
          <div className="file-list-actions">
            <Tooltip content="刷新">
              <button
                className="file-list-action"
                type="button"
                aria-label="刷新"
                aria-busy={loadingRoot}
                onClick={refresh}
              >
                <RefreshCw className={cn('size-3.5', loadingRoot && 'animate-spin')} />
              </button>
            </Tooltip>
          </div>
        </div>

        {error === undefined
          ? null
          : <p className="shrink-0 py-2 text-[11px] text-danger">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingRoot && rootEntries.length === 0
            ? (
                <div className="flex flex-col gap-2 py-2">
                  <Skeleton className="h-[46px] w-full" />
                  <Skeleton className="h-[46px] w-[80%]" />
                  <Skeleton className="h-[46px] w-[70%]" />
                </div>
              )
            : rootKey === undefined || rootEntries.length === 0
              ? <EmptyState icon={Folder} title="这个目录是空的" description="Agent 创建文件后，它们会出现在这里。" />
              : (
                  <div
                    className={cn(
                      'file-list w-full min-w-0',
                      compact && '[&_.file-list-head]:grid-cols-[20px_24px_minmax(0,1fr)_32px] [&_.file-list-row]:grid-cols-[20px_24px_minmax(0,1fr)_32px]',
                    )}
                    role="tree"
                    aria-label="工作区文件"
                  >
                    {!compact
                      ? (
                          <div className="file-list-head" aria-hidden>
                            <span />
                            <span />
                            <span>
                              Name
                              {' '}
                              <span className="text-muted-foreground">· status</span>
                            </span>
                            <span>Size</span>
                            <span />
                          </div>
                        )
                      : null}
                    {rootEntries.map(entry => (
                      <TreeNode
                        key={entry.path}
                        entry={entry}
                        depth={0}
                        compact={compact}
                        root={rootKey}
                        expanded={expanded}
                        childrenMap={children}
                        loadingPaths={loadingPaths}
                        stats={stats}
                        hasSession={hasSession}
                        busy={busy}
                        onToggle={toggleExpand}
                        onOpenFile={(path) => {
                          actions.openPanel('preview', { target: { kind: 'file', path } })
                        }}
                        onMention={(path) => {
                          const relative = toRelativePath(rootKey, path)
                          appendComposerDraft(`@${relative}`)
                        }}
                        onCopyRelative={(path) => {
                          void copyText('相对路径', toRelativePath(rootKey, path))
                        }}
                        onCopyAbsolute={(path) => {
                          void copyText('绝对路径', path)
                        }}
                        onDownload={(item) => {
                          void downloadEntry(item)
                        }}
                        onCreate={(parentPath, kind) => {
                          setCreateName('')
                          setCreateDialog({ parentPath, kind })
                        }}
                        onDelete={(item) => {
                          setDeleteDialog({ path: item.path, name: item.name, kind: item.kind })
                        }}
                      />
                    ))}
                  </div>
                )}
        </div>

        <div className="file-list-footer shrink-0">
          <span>
            <strong>{String(rootEntries.length)}</strong>
            {' '}
            项
          </span>
          <span className="truncate font-mono">{root}</span>
        </div>
      </div>

      <Dialog
        open={createDialog !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialog(undefined)
            setCreateName('')
          }
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-48px))]">
          <DialogBody>
            <DialogTitle>{createDialog?.kind === 'directory' ? '新建文件夹' : '新建文件'}</DialogTitle>
            <DialogDescription>在当前目录下创建。</DialogDescription>
            <Input
              className="mt-3"
              value={createName}
              onChange={event => setCreateName(event.target.value)}
              placeholder={createDialog?.kind === 'directory' ? '文件夹名' : '文件名'}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submitCreate()
                }
              }}
            />
          </DialogBody>
          <DialogActions>
            <Button variant="secondary" onClick={() => setCreateDialog(undefined)}>取消</Button>
            <Button
              variant="primary"
              disabled={busy || createName.trim() === ''}
              onClick={() => {
                void submitCreate()
              }}
            >
              创建
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(undefined)
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-48px))]">
          <DialogBody>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              将永久删除
              {' '}
              <span className="font-mono text-foreground">{deleteDialog?.name}</span>
              {deleteDialog?.kind === 'directory' ? '（文件夹及其内容）' : ''}
              。此操作不可撤销。
            </DialogDescription>
          </DialogBody>
          <DialogActions>
            <Button variant="secondary" onClick={() => setDeleteDialog(undefined)}>取消</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                void submitDelete()
              }}
            >
              删除
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TreeNode({
  entry,
  depth,
  compact,
  root,
  expanded,
  childrenMap,
  loadingPaths,
  stats,
  hasSession,
  busy,
  onToggle,
  onOpenFile,
  onMention,
  onCopyRelative,
  onCopyAbsolute,
  onDownload,
  onCreate,
  onDelete,
}: {
  entry: FsEntry
  depth: number
  compact: boolean
  root: string
  expanded: Set<string>
  childrenMap: Map<string, FsEntry[]>
  loadingPaths: Set<string>
  stats: Map<string, DiffStat>
  hasSession: boolean
  busy: boolean
  onToggle(path: string): void
  onOpenFile(path: string): void
  onMention(path: string): void
  onCopyRelative(path: string): void
  onCopyAbsolute(path: string): void
  onDownload(entry: FsEntry): void
  onCreate(parentPath: string, kind: CreateKind): void
  onDelete(entry: FsEntry): void
}): ReactNode {
  const isDirectory = entry.kind === 'directory'
  const isExpanded = expanded.has(entry.path)
  const childEntries = childrenMap.get(entry.path) ?? []
  const loading = loadingPaths.has(entry.path)
  const stat = statFor(entry.path, stats)
  const [menuOpen, setMenuOpen] = useState(false)
  const createParent = isDirectory ? entry.path : (entry.path.includes('/')
    ? entry.path.slice(0, entry.path.lastIndexOf('/')) || root
    : root)

  return (
    <>
      <div
        className="file-list-row"
        role="treeitem"
        aria-expanded={isDirectory ? isExpanded : undefined}
        style={depth > 0 ? { paddingLeft: `${depth * 14}px` } : undefined}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuOpen(true)
        }}
      >
        {isDirectory
          ? (
              <button
                type="button"
                className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={isExpanded ? '折叠' : '展开'}
                onClick={() => onToggle(entry.path)}
              >
                {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
            )
          : <span aria-hidden />}

        <span className={cn('file-icon', isDirectory && 'is-folder')}>
          {isDirectory ? 'DIR' : extensionGlyph(entry.name)}
        </span>

        <button
          type="button"
          className="file-main min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => {
            if (isDirectory) {
              onToggle(entry.path)
              return
            }
            onOpenFile(entry.path)
          }}
        >
          <span className="file-name">{entry.name}</span>
          {compact
            ? null
            : stat === undefined
              ? isDirectory
                ? (
                    <span className="file-meta">
                      <span>{childEntries.length > 0 ? `${String(childEntries.length)} files` : 'folder'}</span>
                    </span>
                  )
                : null
              : (
                  <span className="file-meta">
                    <span className="font-mono text-success">
                      +
                      {String(stat.additions)}
                    </span>
                    <span>·</span>
                    <span className="font-mono text-danger">
                      −
                      {String(stat.deletions)}
                    </span>
                  </span>
                )}
        </button>

        {compact
          ? null
          : (
              <span className="file-size">
                {isDirectory ? '—' : formatSize(entry.size)}
              </span>
            )}

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="file-row-menu" aria-label={`更多操作：${entry.name}`}>
              ⋯
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                icon={<AtSign />}
                disabled={!hasSession}
                onSelect={() => onMention(entry.path)}
              >
                引用到对话
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onCopyRelative(entry.path)}>复制相对路径</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopyAbsolute(entry.path)}>复制绝对路径</DropdownMenuItem>
              {isDirectory
                ? null
                : (
                    <DropdownMenuItem
                      icon={<Download />}
                      disabled={busy}
                      onSelect={() => onDownload(entry)}
                    >
                      下载
                    </DropdownMenuItem>
                  )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                icon={<FilePlus />}
                onSelect={() => onCreate(createParent, 'file')}
              >
                新建文件
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<FolderPlus />}
                onSelect={() => onCreate(createParent, 'directory')}
              >
                新建文件夹
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                icon={<Trash2 />}
                danger
                onSelect={() => onDelete(entry)}
              >
                删除
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isDirectory && isExpanded
        ? (
            <div role="group">
              {loading && childEntries.length === 0
                ? <Skeleton className="my-1 h-[46px]" style={{ marginLeft: `${22 + depth * 14}px` }} />
                : childEntries.map(child => (
                    <TreeNode
                      key={child.path}
                      entry={child}
                      depth={depth + 1}
                      compact={compact}
                      root={root}
                      expanded={expanded}
                      childrenMap={childrenMap}
                      loadingPaths={loadingPaths}
                      stats={stats}
                      hasSession={hasSession}
                      busy={busy}
                      onToggle={onToggle}
                      onOpenFile={onOpenFile}
                      onMention={onMention}
                      onCopyRelative={onCopyRelative}
                      onCopyAbsolute={onCopyAbsolute}
                      onDownload={onDownload}
                      onCreate={onCreate}
                      onDelete={onDelete}
                    />
                  ))}
            </div>
          )
        : null}
    </>
  )
}

export const filesPanel = definePanel<void>({
  id: 'files',
  title: '文件',
  icon: File,
  scope: 'workspace',
  multiInstance: false,
  preferredDock: 'right',
  render: props => <FilesPanel {...props} />,
})
