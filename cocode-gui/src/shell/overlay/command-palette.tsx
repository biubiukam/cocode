/**
 * The command palette (RFC §8, overlay layer).
 *
 * Items come from the `shell.palette` slot. Session search is a host round-trip.
 */

import { useEffect, useState } from 'react'
import {
  Command, File, FolderGit2, Globe, ListTodo, PanelBottom, PanelLeft, PanelRight,
  Plus, Puzzle, RotateCcw, Search, Settings, SquareTerminal, Waypoints, Zap,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, Input, cn } from '@cocode/ui'
import type { LucideIcon } from 'lucide-react'
import { useSlotContributions } from '../../boot/slot-renderer.tsx'
import { useLayoutActions, useSessions } from '../runtime-context.tsx'

type PaletteInject = {
  id?: string
  label?: string
  hint?: string
  icon?: string
  group?: string
  disabled?: boolean
  run?: () => void
}

const ICONS: Record<string, LucideIcon> = {
  plus: Plus,
  settings: Settings,
  sidebar: PanelLeft,
  'dock-right': PanelRight,
  'dock-bottom': PanelBottom,
  puzzle: Puzzle,
  zap: Zap,
  file: File,
  git: FolderGit2,
  terminal: SquareTerminal,
  preview: File,
  browser: Globe,
  trajectory: Waypoints,
  jobs: ListTodo,
  replay: RotateCcw,
}

export function CommandPalette({
  open, onOpenChange, onOpenSettings,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onOpenSettings(): void
}) {
  const sessions = useSessions()
  const actions = useLayoutActions()
  const contributed = useSlotContributions<PaletteInject>('shell.palette')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<{ sessionId: string; snippet: string }[]>([])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!open || trimmed.length < 2) {
      setMatches([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void sessions.searchSessions(trimmed, controller.signal).then(setMatches)
    }, 180)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, open, sessions])

  const items = contributed.flatMap(item => {
    if (typeof item.id !== 'string' || typeof item.label !== 'string' || typeof item.run !== 'function') return []
    return [{
      id: item.id,
      label: item.label,
      hint: typeof item.hint === 'string' ? item.hint : undefined,
      icon: ICONS[item.icon ?? ''] ?? Command,
      group: typeof item.group === 'string' ? item.group : '动作',
      disabled: item.disabled === true,
      run: item.id === 'settings.open' ? onOpenSettings : item.run,
    }]
  })

  const normalized = query.trim().toLowerCase()
  const filtered = normalized === '' ? items : items.filter(item => item.label.toLowerCase().includes(normalized))
  const groups = [...new Set(filtered.map(item => item.group))]

  const activate = (run: () => void) => {
    onOpenChange(false)
    run()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[16%] w-[min(620px,calc(100vw-48px))] translate-y-0 p-0">
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <DialogDescription className="sr-only">搜索动作、面板与任务</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Command className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索动作、面板或任务"
            aria-label="命令面板搜索"
            className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:shadow-none"
          />
        </div>

        <div className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
          {groups.map(group => (
            <div key={group}>
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{group}</p>
              {filtered.filter(item => item.group === group).map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => { if (!item.disabled) activate(item.run) }}
                    className={cn(
                      'flex min-h-[38px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px]',
                      item.disabled ? 'cursor-not-allowed text-subtle-foreground' : 'hover:bg-secondary',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint === undefined
                      ? null
                      : <kbd className="shrink-0 rounded-[4px] border border-border bg-surface-sunken px-1.5 font-mono text-[10px]">{item.hint}</kbd>}
                  </button>
                )
              })}
            </div>
          ))}

          {matches.length === 0
            ? null
            : (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">任务</p>
                  {matches.map(match => (
                    <button
                      key={match.sessionId}
                      type="button"
                      onClick={() => activate(() => {
                        actions.setCenterView('conversation')
                        sessions.setActiveSession(match.sessionId)
                      })}
                      className="flex min-h-[38px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] hover:bg-secondary"
                    >
                      <Search className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{match.snippet}</span>
                    </button>
                  ))}
                </div>
              )}

          {filtered.length === 0 && matches.length === 0
            ? <p className={cn('px-3 py-6 text-center text-[11px] text-muted-foreground')}>没有匹配的结果。</p>
            : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
