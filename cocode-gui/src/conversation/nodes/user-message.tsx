/**
 * A human prompt (design system §5.1). Injected context messages use the same
 * component with a marker, because they are model-visible and hiding them
 * entirely would make the transcript lie about what the model read.
 */

import { Sparkles, User } from 'lucide-react'
import { cn } from '@cocode/ui'
import type { UserNode } from '../../runtime/index.ts'
import { ContentBlocks } from '../../views/content-blocks.tsx'

export function UserMessage({ node }: { node: UserNode }) {
  return (
    <article className={cn('cocode-rise grid grid-cols-[30px_minmax(0,1fr)] gap-3.5 py-3.5')}>
      <div
        aria-hidden
        className={cn(
          'grid size-[30px] place-items-center rounded-full',
          node.synthetic ? 'bg-surface-sunken text-subtle-foreground' : 'bg-secondary text-secondary-foreground',
        )}
      >
        {node.synthetic ? <Sparkles className="size-3.5" /> : <User className="size-3.5" />}
      </div>
      <div className="min-w-0">
        {node.synthetic
          ? <p className="mb-1 text-[10px] uppercase tracking-[0.06em] text-subtle-foreground">注入的上下文</p>
          : null}
        <div className={cn('rounded-md bg-accent-soft px-3 py-2', node.synthetic && 'bg-surface-sunken')}>
          <ContentBlocks blocks={node.blocks} />
        </div>
      </div>
    </article>
  )
}
