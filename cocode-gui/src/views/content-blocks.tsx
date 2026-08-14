/**
 * Renders model-facing content blocks. The block map is merge-extensible on the
 * harness side, so an unknown block falls through to pretty JSON rather than
 * disappearing — a silently dropped block is a bug the user cannot see.
 */

import type { ContentBlock } from '@cocode/gui-connection'
import { cn } from '@cocode/ui'
import { CodeView } from './code-view.tsx'
import { MarkdownView } from './markdown.tsx'
import { SessionImage } from './session-image.tsx'

export function ContentBlocks({ blocks, className }: { blocks: readonly ContentBlock[]; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return <MarkdownView key={index} text={String(block['text'] ?? '')} />
          case 'reasoning':
            return (
              <p key={index} className="whitespace-pre-wrap text-[12px] italic leading-[1.5] text-muted-foreground">
                {String(block['text'] ?? '')}
              </p>
            )
          case 'image': {
            const attachment = block['attachment'] as { id?: string; name?: string } | undefined
            if (attachment?.id === undefined) return null
            return <SessionImage key={index} attachmentId={attachment.id} name={attachment.name} />
          }
          default:
            return <CodeView key={index} code={JSON.stringify(block, null, 2)} language="json" />
        }
      })}
    </div>
  )
}
