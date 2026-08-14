/**
 * Git: local review surface — status, stage/unstage, discard, history, branch
 * (RFC dock-panel-depth §3.3). Porcelain only via `git.*` wire.
 */

import { useEffect, useRef, useState } from 'react'
import { GitBranch, History, MoreHorizontal, RefreshCw } from 'lucide-react'
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
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Tooltip,
  cn,
} from '@cocode/ui'
import type { GitChangedFile, GitDiffFile, GitLogItem, GitStatus } from '@cocode/gui-connection'
import { definePanel, type PanelProps } from '../types.ts'
import { isLoopbackOrigin } from '../../host/bridge.ts'
import {
  useActiveSession,
  useConnection,
  useConnectionService,
  useSessionDirectory,
  useSessionSnapshot,
} from '../../shell/runtime-context.tsx'
import { useToast } from '../../shell/overlay/toast.tsx'
import { DiffView } from '../../views/diff-view.tsx'

const STATUS_LABEL: Record<GitChangedFile['status'], string> = {
  untracked: '未跟踪',
  modified: '已修改',
  added: '新增',
  deleted: '已删除',
  renamed: '重命名',
  copied: '复制',
  conflict: '冲突',
}

const LOG_PAGE = 30

type ConfirmAction =
  | { kind: 'discard'; path: string }
  | { kind: 'revert'; sha: string; subject: string }
  | { kind: 'cherryPick'; sha: string; subject: string }

function GitPanel({ sizeClass, active, markUnread }: PanelProps) {
  const connectionService = useConnectionService()
  const connection = useConnection()
  const directory = useSessionDirectory()
  const snapshot = useSessionSnapshot(useActiveSession())
  const toast = useToast()
  const workspaceId = directory.activeWorkspaceId
  const privileged = isLoopbackOrigin(connection.baseUrl)

  const [status, setStatus] = useState<GitStatus | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [diff, setDiff] = useState<GitDiffFile | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const [branches, setBranches] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState('')

  const [logItems, setLogItems] = useState<GitLogItem[]>([])
  const [logSkip, setLogSkip] = useState(0)
  const [logHasMore, setLogHasMore] = useState(true)
  const [logLoading, setLogLoading] = useState(false)
  const [logLoaded, setLogLoaded] = useState(false)
  const [selectedSha, setSelectedSha] = useState<string | undefined>(undefined)
  const [commitDiffs, setCommitDiffs] = useState<GitDiffFile[]>([])

  const [confirm, setConfirm] = useState<ConfirmAction | undefined>(undefined)
  const [tab, setTab] = useState<'changes' | 'history'>('changes')

  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (active) {
      seen.current = new Set(status?.files.map(file => file.path) ?? [])
      return
    }
    for (const file of status?.files ?? []) {
      if (seen.current.has(file.path)) continue
      markUnread()
      break
    }
  }, [active, status, markUnread])

  useEffect(() => {
    if (!privileged || workspaceId === undefined) {
      setStatus(undefined)
      setError(undefined)
      return
    }
    const transport = connectionService.activeTransport
    if (transport === undefined) return
    const controller = new AbortController()
    void transport.call('git.status', { workspaceId }, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) {
        setStatus(result.value)
        setCurrentBranch(result.value.branch)
        setError(undefined)
        return
      }
      setError(result.error.message)
    })
    return () => controller.abort()
  }, [privileged, workspaceId, connectionService.activeTransport, tick, snapshot?.updatedAt])

  useEffect(() => {
    if (!privileged || workspaceId === undefined) return
    const transport = connectionService.activeTransport
    if (transport === undefined) return
    const controller = new AbortController()
    void transport.call('git.branch', { workspaceId }, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) {
        setBranches(result.value.branches)
        setCurrentBranch(result.value.current)
        return
      }
      // Branch list is optional; surface as soft error only when status also failed.
    })
    return () => controller.abort()
  }, [privileged, workspaceId, connectionService.activeTransport, tick, snapshot?.updatedAt])

  useEffect(() => {
    if (!privileged || workspaceId === undefined || selected === undefined || tab !== 'changes') {
      if (tab === 'changes') setDiff(undefined)
      return
    }
    const transport = connectionService.activeTransport
    if (transport === undefined) return
    const controller = new AbortController()
    void transport.call('git.diff', { workspaceId, path: selected }, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setDiff(result.value.files[0])
    })
    return () => controller.abort()
  }, [privileged, workspaceId, selected, connectionService.activeTransport, tick, snapshot?.updatedAt, tab])

  async function loadLog(reset: boolean): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    const skip = reset ? 0 : logSkip
    setLogLoading(true)
    const result = await transport.call('git.log', { workspaceId, count: LOG_PAGE, skip })
    setLogLoading(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      return
    }
    const items = result.value.items
    setLogItems(prev => (reset ? items : [...prev, ...items]))
    setLogSkip(skip + items.length)
    setLogHasMore(items.length >= LOG_PAGE)
    setLogLoaded(true)
  }

  useEffect(() => {
    if (tab !== 'history' || logLoaded || !privileged || workspaceId === undefined) return
    void loadLog(true)
    // Intentionally only when switching into history the first time / after refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, logLoaded, privileged, workspaceId, tick])

  async function showCommit(sha: string): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    setSelectedSha(sha)
    setSelected(undefined)
    setBusy(true)
    const result = await transport.call('git.show', { workspaceId, rev: sha })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      setCommitDiffs([])
      return
    }
    setCommitDiffs(result.value.files)
  }

  async function stage(path: string): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    setBusy(true)
    const result = await transport.call('git.stage', { workspaceId, paths: [path] })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      setError(result.error.message)
    }
    setTick(value => value + 1)
  }

  async function unstage(path: string): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    setBusy(true)
    const result = await transport.call('git.unstage', { workspaceId, paths: [path] })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      setError(result.error.message)
    }
    setTick(value => value + 1)
  }

  async function commit(): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    const trimmed = message.trim()
    if (trimmed === '') return
    setBusy(true)
    const result = await transport.call('git.commit', { workspaceId, message: trimmed })
    setBusy(false)
    if (result.ok) {
      setMessage('')
      toast.push('success', '已提交')
    }
    else {
      toast.push('warning', result.error.message)
      setError(result.error.message)
    }
    setTick(value => value + 1)
  }

  async function checkout(ref: string): Promise<void> {
    if (ref === currentBranch) return
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) return
    setBusy(true)
    const result = await transport.call('git.checkout', { workspaceId, ref })
    setBusy(false)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      setError(result.error.message)
      return
    }
    setCurrentBranch(result.value.branch)
    toast.push('success', `已切换到 ${result.value.branch}`)
    setTick(value => value + 1)
  }

  async function runConfirm(): Promise<void> {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined || confirm === undefined) return
    const action = confirm
    setBusy(true)
    const result = action.kind === 'discard'
      ? await transport.call('git.discard', { workspaceId, paths: [action.path] })
      : action.kind === 'revert'
        ? await transport.call('git.revert', { workspaceId, sha: action.sha })
        : await transport.call('git.cherryPick', { workspaceId, sha: action.sha })
    setBusy(false)
    setConfirm(undefined)
    if (!result.ok) {
      toast.push('warning', result.error.message)
      setError(result.error.message)
      return
    }
    toast.push(
      'success',
      action.kind === 'discard' ? '已丢弃改动' : action.kind === 'revert' ? '已 revert' : '已 cherry-pick',
    )
    setTick(value => value + 1)
    if (action.kind !== 'discard') {
      setLogLoaded(false)
      setLogItems([])
      setLogSkip(0)
      setCommitDiffs([])
      setSelectedSha(undefined)
    }
  }

  function refresh(): void {
    setLogLoaded(false)
    setLogItems([])
    setLogSkip(0)
    setLogHasMore(true)
    setCommitDiffs([])
    setSelectedSha(undefined)
    setTick(value => value + 1)
  }

  if (workspaceId === undefined) {
    return <EmptyState icon={GitBranch} title="没有选中的项目" description="从左侧选择一个项目后，这里会显示它的 Git 状态。" className="m-4" />
  }
  if (!privileged) {
    return (
      <EmptyState
        icon={GitBranch}
        title="远程连接无法使用 Git"
        description="git 操作被 harness 限定在 loopback 同源。改用本机运行或经隧道同源访问即可恢复。"
        className="m-4"
      />
    )
  }
  if (error !== undefined && status === undefined) {
    return <EmptyState icon={GitBranch} title="不是 Git 仓库" description={error} className="m-4" />
  }
  if (status === undefined) {
    return <Skeleton className="m-3 h-24" />
  }

  const compact = sizeClass === 'compact'
  const files = status.files
  const branchOptions = (branches.length > 0 ? branches : [status.branch]).map(name => ({
    value: name,
    label: name,
  }))

  const confirmCopy = confirm === undefined
    ? { title: '', description: '' }
    : confirm.kind === 'discard'
      ? {
          title: '丢弃改动',
          description: `确定丢弃「${confirm.path}」的工作区改动？此操作不可撤销。`,
        }
      : confirm.kind === 'revert'
        ? {
            title: 'Revert 提交',
            description: `确定 revert「${confirm.subject}」（${confirm.sha.slice(0, 7)}）？`,
          }
        : {
            title: 'Cherry-pick 提交',
            description: `确定 cherry-pick「${confirm.subject}」（${confirm.sha.slice(0, 7)}）到当前分支？`,
          }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-[40px] shrink-0 items-center gap-2 border-b border-border px-3">
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {branchOptions.length <= 1
            ? (
                <span className="truncate font-mono text-[12px] font-semibold">{currentBranch || status.branch}</span>
              )
            : (
                <Select
                  label="分支"
                  className="!gap-0 [&_.field-label]:sr-only"
                  options={branchOptions}
                  value={currentBranch || status.branch}
                  onChange={(value: string) => {
                    void checkout(value)
                  }}
                />
              )}
        </div>
        {status.ahead > 0 ? <span className="font-mono text-[11px] text-success">↑{String(status.ahead)}</span> : null}
        {status.behind > 0 ? <span className="font-mono text-[11px] text-danger">↓{String(status.behind)}</span> : null}
        <div className="flex items-center gap-0.5">
          <Button
            size="xs"
            variant={tab === 'changes' ? 'secondary' : 'ghost'}
            onClick={() => setTab('changes')}
          >
            变更
          </Button>
          <Button
            size="xs"
            variant={tab === 'history' ? 'secondary' : 'ghost'}
            onClick={() => setTab('history')}
          >
            <History />
            历史
          </Button>
          <Tooltip content="刷新">
            <IconButton size="xs" label="刷新" disabled={busy} onClick={refresh}>
              <RefreshCw />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {error === undefined
        ? null
        : <p className="shrink-0 border-b border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p>}

      {tab === 'changes'
        ? (
            <>
              <div className={cn('min-h-0 flex-1', compact ? 'flex flex-col' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]')}>
                <ul className={cn('min-h-0 overflow-y-auto p-2', compact ? 'border-b border-border' : 'border-r border-border')}>
                  {files.length === 0
                    ? <p className="px-2 py-4 text-[12px] text-muted-foreground">工作区是干净的。</p>
                    : files.map(file => (
                        <li key={file.path} className="flex flex-col gap-1 border-b border-border py-1 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(file.path)
                              setSelectedSha(undefined)
                              setCommitDiffs([])
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface-sunken',
                              selected === file.path && 'bg-surface-sunken',
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.path}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{STATUS_LABEL[file.status]}</span>
                            {file.staged
                              ? <span className="shrink-0 text-[10px] text-accent-ink">已暂存</span>
                              : null}
                          </button>
                          <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
                            {file.staged
                              ? (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      void unstage(file.path)
                                    }}
                                  >
                                    取消暂存
                                  </Button>
                                )
                              : (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      void stage(file.path)
                                    }}
                                  >
                                    暂存
                                  </Button>
                                )}
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={busy || file.status === 'untracked'}
                              onClick={() => setConfirm({ kind: 'discard', path: file.path })}
                            >
                              丢弃
                            </Button>
                          </div>
                        </li>
                      ))}
                </ul>
                <div className="min-h-0 overflow-auto p-2">
                  {diff === undefined
                    ? <p className="px-2 py-4 text-[12px] text-muted-foreground">选择一个文件查看 diff。</p>
                    : <DiffView diff={diff} />}
                </div>
              </div>
              <form
                className="flex shrink-0 gap-2 border-t border-border p-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void commit()
                }}
              >
                <Input
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  placeholder="提交说明"
                  className="min-w-0 flex-1"
                />
                <Button type="submit" variant="primary" size="sm" disabled={busy || message.trim() === ''}>
                  提交
                </Button>
              </form>
            </>
          )
        : (
            <div className={cn('min-h-0 flex-1', compact ? 'flex flex-col' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]')}>
              <div className={cn('min-h-0 overflow-y-auto p-2', compact ? 'border-b border-border' : 'border-r border-border')}>
                {logLoading && logItems.length === 0
                  ? <Skeleton className="h-20" />
                  : logItems.length === 0
                    ? <p className="px-2 py-4 text-[12px] text-muted-foreground">暂无提交历史。</p>
                    : (
                        <ul className="flex flex-col">
                          {logItems.map(item => (
                            <li key={item.sha} className="border-b border-border last:border-b-0">
                              <div
                                className={cn(
                                  'flex items-start gap-1 rounded-sm px-1 py-1.5 hover:bg-surface-sunken',
                                  selectedSha === item.sha && 'bg-surface-sunken',
                                )}
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 px-1 text-left"
                                  onClick={() => {
                                    void showCommit(item.sha)
                                  }}
                                >
                                  <p className="truncate text-[12px] font-semibold text-foreground">{item.subject}</p>
                                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                                    {item.sha.slice(0, 7)}
                                    {' · '}
                                    {item.author}
                                    {' · '}
                                    {item.authoredAt}
                                  </p>
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <IconButton size="xs" label="提交操作">
                                      <MoreHorizontal />
                                    </IconButton>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                      <DropdownMenuItem
                                        onSelect={() => setConfirm({ kind: 'revert', sha: item.sha, subject: item.subject })}
                                      >
                                        Revert
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onSelect={() => setConfirm({ kind: 'cherryPick', sha: item.sha, subject: item.subject })}
                                      >
                                        Cherry-pick
                                      </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                {logHasMore
                  ? (
                      <div className="p-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full"
                          disabled={logLoading}
                          onClick={() => {
                            void loadLog(false)
                          }}
                        >
                          {logLoading ? '加载中…' : '加载更多'}
                        </Button>
                      </div>
                    )
                  : null}
              </div>
              <div className="min-h-0 overflow-auto p-2">
                {selectedSha === undefined
                  ? <p className="px-2 py-4 text-[12px] text-muted-foreground">选择一条提交查看 diff。</p>
                  : commitDiffs.length === 0
                    ? (
                        busy
                          ? <Skeleton className="h-24" />
                          : <p className="px-2 py-4 text-[12px] text-muted-foreground">此提交没有可展示的 diff。</p>
                      )
                    : (
                        <div className="flex flex-col gap-3">
                          {commitDiffs.map(file => (
                            <DiffView key={file.path} diff={file} />
                          ))}
                        </div>
                      )}
              </div>
            </div>
          )}

      <Dialog open={confirm !== undefined} onOpenChange={(open) => { if (!open) setConfirm(undefined) }}>
        <DialogContent className="w-[min(420px,calc(100vw-48px))]">
          <DialogBody>
            <DialogTitle>{confirmCopy.title}</DialogTitle>
            <DialogDescription>{confirmCopy.description}</DialogDescription>
          </DialogBody>
          <DialogActions>
            <Button variant="secondary" onClick={() => setConfirm(undefined)}>取消</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                void runConfirm()
              }}
            >
              确认
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const gitPanel = definePanel<void>({
  id: 'git',
  title: 'Git',
  icon: GitBranch,
  scope: 'workspace',
  multiInstance: false,
  preferredDock: 'right',
  render: props => <GitPanel {...props} />,
})
