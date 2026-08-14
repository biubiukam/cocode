import { cn } from '@cocode/ui'
import type { ProviderCard } from '../../../runtime/providers/store.ts'

const STATUS_LABEL: Record<ProviderCard['status'], string> = {
  configured: '已配置',
  env: '已由环境提供',
  'no-key': '无需 Key',
  missing: '未配置',
}

export function ProviderGallery({
  cards,
  onSelect,
}: {
  cards: readonly ProviderCard[]
  onSelect(provider: string): void
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto">
      {cards.map(card => (
        <button
          type="button"
          key={card.provider}
          onClick={() => onSelect(card.provider)}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-raised p-3 text-left shadow-sm hover:border-border-strong"
        >
          <span className="text-[13px] font-semibold">{card.displayName}</span>
          <span className={cn(
            'text-[11px]',
            card.status === 'missing' ? 'text-muted-foreground' : 'text-success',
          )}
          >
            {STATUS_LABEL[card.status]}
          </span>
        </button>
      ))}
    </div>
  )
}
