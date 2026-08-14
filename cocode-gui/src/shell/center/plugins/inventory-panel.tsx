/**
 * Read-only Cordis Loader inventory. Search is local; the Host is never asked
 * to filter, and nothing on this tab writes.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Button, EmptyState, Input, cn } from '@cocode/ui'
import type { PluginFiberPhase, PluginInventoryEntry } from '@cocode/gui-connection'
import { useConnection, usePluginSettings, usePluginSettingsStore } from '../../runtime-context.tsx'

const PHASE_LABEL: Record<Exclude<PluginFiberPhase, null>, string> = {
  pending: '等待依赖',
  loading: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
}

function phaseLabel(phase: PluginFiberPhase): string {
  return phase === null ? '未挂载' : PHASE_LABEL[phase]
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
export function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

function matches(entry: PluginInventoryEntry, query: string): boolean {
  if (query.length === 0) return true
  return [entry.moduleName, entry.entryId].some(value => value.toLocaleLowerCase().includes(query))
}

function InventoryCard({
  entry,
  open,
  onToggle,
}: {
  entry: PluginInventoryEntry
  open: boolean
  onToggle(): void
}) {
  const title = moduleShortName(entry.moduleName)
  const configuration = entry.enabled ? '已启用' : '已停用'
  const status = phaseLabel(entry.fiberPhase)
  return (
    <li className="rounded-lg border border-border bg-surface-raised">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
        aria-label={entry.enabled ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`}
        onClick={onToggle}
      >
        <strong className="min-w-0 flex-1 truncate text-[13px] font-medium" title={entry.moduleName}>{title}</strong>
        <span className="flex shrink-0 items-center gap-1.5">
          {entry.enabled
            ? <span className="size-1.5 rounded-full bg-success" role="img" aria-label={status} title={status} />
            : null}
          <span className={cn('text-[11px]', entry.enabled ? 'text-foreground' : 'text-muted-foreground')}>
            {configuration}
          </span>
          <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {open
        ? (
            <div className="border-t border-border px-3 py-2.5">
              <code className="block truncate font-mono text-[11px] text-muted-foreground">{entry.entryId}</code>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-muted-foreground">配置状态</dt>
                <dd>{configuration}</dd>
                {entry.enabled
                  ? (
                      <>
                        <dt className="text-muted-foreground">Cordis 状态</dt>
                        <dd>{status}</dd>
                      </>
                    )
                  : null}
              </dl>
            </div>
          )
        : null}
    </li>
  )
}

export function InventoryPanel() {
  const pluginSettings = usePluginSettingsStore()
  const connection = useConnection()
  const snapshot = usePluginSettings()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (connection.phase !== 'ready') return
    void pluginSettings.loadInventory()
  }, [pluginSettings, connection.phase, connection.generation])

  const normalized = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => snapshot.inventory.filter(entry => matches(entry, normalized)),
    [normalized, snapshot.inventory],
  )

  useEffect(() => {
    if (expanded !== null && !filtered.some(entry => entry.entryId === expanded)) setExpanded(null)
  }, [expanded, filtered])

  if (snapshot.inventoryStatus === 'idle' || snapshot.inventoryStatus === 'loading') {
    return <p className="text-[13px] text-muted-foreground" aria-busy="true">正在读取插件…</p>
  }

  if (snapshot.inventoryStatus === 'error') {
    return (
      <EmptyState
        icon={Search}
        title="暂时无法读取插件"
        description="Host 没有返回 Loader 清单。"
        action={<Button size="sm" onClick={() => { void pluginSettings.retryInventory() }}>重试</Button>}
      />
    )
  }

  return (
    <div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          placeholder="搜索插件"
          aria-label="搜索插件"
          className="h-8 pl-8 text-[12px]"
          onChange={event => setQuery(event.target.value)}
        />
      </label>
      <div className="mt-3 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold">插件列表</h3>
        <span className="text-[12px] text-muted-foreground">{filtered.length}</span>
      </div>
      {snapshot.inventory.length === 0
        ? <p className="mt-6 text-center text-[13px] text-muted-foreground">暂无插件。</p>
        : null}
      {snapshot.inventory.length > 0 && filtered.length === 0
        ? <p className="mt-6 text-center text-[13px] text-muted-foreground">没有匹配的插件。</p>
        : null}
      {filtered.length > 0
        ? (
            <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {filtered.map(entry => (
                <InventoryCard
                  key={entry.entryId}
                  entry={entry}
                  open={expanded === entry.entryId}
                  onToggle={() => setExpanded(current => current === entry.entryId ? null : entry.entryId)}
                />
              ))}
            </ul>
          )
        : null}
    </div>
  )
}
