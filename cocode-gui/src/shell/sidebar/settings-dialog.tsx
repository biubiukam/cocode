/**
 * Settings modal. Sections come from the `settings.section` slot.
 */

import { useMemo, useState, type ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Keyboard, Link2, Palette, RotateCcw, Search, Settings2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, Input, cn } from '@cocode/ui'
import { useSlotContributions } from '../../boot/slot-renderer.tsx'

type SectionInject = {
  id?: string
  group?: string
  label?: string
  description?: string
  icon?: string
}

const ICONS: Record<string, LucideIcon> = {
  palette: Palette,
  keyboard: Keyboard,
  link: Link2,
  settings: Settings2,
  replay: RotateCcw,
}

function NavButton({
  icon: Icon,
  label,
  selected,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  selected: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex min-h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-[13px] transition-colors duration-150',
        selected
          ? 'bg-secondary font-semibold text-foreground'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const sections = useSlotContributions<SectionInject>('settings.section')
  const [section, setSection] = useState('appearance')
  const [query, setQuery] = useState('')

  const items = sections.flatMap(entry => {
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string') return []
    return [{
      id: entry.id,
      group: typeof entry.group === 'string' ? entry.group : '其他',
      label: entry.label,
      description: typeof entry.description === 'string' ? entry.description : '',
      icon: ICONS[entry.icon ?? ''] ?? Settings2,
      component: entry.component as ComponentType,
    }]
  })

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (normalizedQuery === '') return items
    return items.filter(item =>
      item.label.toLowerCase().includes(normalizedQuery)
      || item.description.toLowerCase().includes(normalizedQuery),
    )
  }, [items, normalizedQuery])

  const groups = [...new Set(filtered.map(item => item.group))]
  const active = filtered.find(item => item.id === section) ?? filtered[0]
  const Panel = active?.component

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(560px,calc(100vh-80px))] w-[min(780px,calc(100vw-48px))] flex-col overflow-hidden p-0">
        <DialogTitle className="sr-only">设置</DialogTitle>
        <DialogDescription className="sr-only">外观、连接状态与快捷键。</DialogDescription>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-surface-sunken">
            <div className="shrink-0 p-3 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索设置…"
                  className="h-8 pl-8 text-[12px]"
                  aria-label="搜索设置"
                />
              </div>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="设置分类">
              {filtered.length === 0
                ? <p className="px-2 py-1 text-[12px] text-muted-foreground">没有匹配的设置项</p>
                : groups.map(group => (
                    <div key={group} className="mt-1 first:mt-0">
                      <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                        {group}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {filtered.filter(item => item.group === group).map(item => (
                          <NavButton
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            selected={active?.id === item.id}
                            onSelect={() => setSection(item.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
            </nav>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-6 pb-4 pt-5">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">{active?.label ?? '设置'}</h2>
              {active?.description !== undefined && active.description !== ''
                ? <p className="mt-1 text-[12px] text-muted-foreground">{active.description}</p>
                : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
              {Panel === undefined ? null : <Panel />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
