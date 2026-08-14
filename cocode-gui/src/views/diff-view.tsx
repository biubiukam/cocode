/**
 * The diff card (design system §6.2). One implementation serves the inline tool
 * card and the Preview panel, so a change to the review surface lands in both.
 */

import { useMemo } from 'react'
import { FileDiff as FileDiffIcon } from 'lucide-react'
import { cn } from '@cocode/ui'
import type { FileDiff } from '@cocode/gui-connection'
import { buildFileDiff, type DiffLine } from './diff.ts'

const SYMBOL: Record<DiffLine['kind'], string> = { add: '+', remove: '−', context: '' }

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        'grid grid-cols-[34px_20px_minmax(0,1fr)] items-baseline',
        line.kind === 'add' && 'bg-success-soft',
        line.kind === 'remove' && 'bg-danger-soft',
      )}
    >
      <span className="pr-2 text-right text-subtle-foreground">{line.newNumber ?? line.oldNumber ?? ''}</span>
      <span className="text-center text-subtle-foreground">{SYMBOL[line.kind]}</span>
      <span className={cn('whitespace-pre pr-3', line.kind === 'context' && 'text-muted-foreground')}>{line.text}</span>
    </div>
  )
}

export function DiffView({ diff, className }: { diff: FileDiff; className?: string }) {
  const model = useMemo(() => buildFileDiff(diff.path, diff.oldText, diff.newText), [diff])

  return (
    <div className={cn('overflow-hidden rounded-md bg-surface-sunken', className)}>
      <div className="flex min-h-[36px] items-center gap-2 border-b border-border px-3">
        <FileDiffIcon className="size-3.5 shrink-0 text-accent-ink" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{model.path}</span>
        <span className="shrink-0 rounded-full bg-success-soft px-2 font-mono text-[12px] font-bold text-success">
          +{model.additions}
        </span>
        <span className="shrink-0 rounded-full bg-danger-soft px-2 font-mono text-[12px] font-bold text-danger">
          −{model.deletions}
        </span>
      </div>
      <div className="overflow-x-auto font-mono text-[10px] leading-[1.65]">
        <div className="min-w-[430px]">
          {model.hunks.length === 0
            ? <p className="px-3 py-2 text-muted-foreground">内容未发生变化。</p>
            : model.hunks.map((hunk, hunkIndex) => (
                <div key={hunkIndex} className={cn(hunkIndex > 0 && 'border-t border-border')}>
                  {hunk.lines.map((line, lineIndex) => <DiffRow key={lineIndex} line={line} />)}
                </div>
              ))}
        </div>
      </div>
    </div>
  )
}
