/**
 * A durable image attachment. Bytes are fetched through `session.attachment`,
 * which proves the session's log references the id before serving them.
 */

import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { Skeleton, cn } from '@cocode/ui'
import { useActiveSession, useConnectionService } from '../shell/runtime-context.tsx'

export function SessionImage({ attachmentId, name, className }: { attachmentId: string; name?: string; className?: string }) {
  const connectionService = useConnectionService()
  const session = useActiveSession()
  const [source, setSource] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const transport = connectionService.activeTransport
    if (transport === undefined || session === undefined) return
    void transport.call('session.attachment', { sessionId: session.sessionId, attachmentId }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setFailed(true)
        return
      }
      setSource(`data:${result.value.attachment.mediaType};base64,${result.value.data}`)
    })
    return () => { cancelled = true }
  }, [attachmentId, connectionService, session])

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-[11px] text-muted-foreground">
        <ImageOff className="size-4" />
        无法读取图片附件
      </div>
    )
  }
  if (source === undefined) return <Skeleton className="h-32 w-full max-w-[320px]" />

  return (
    <img
      src={source}
      alt={name ?? '会话图片附件'}
      className={cn('max-h-[420px] max-w-full rounded-sm border border-border object-contain', className)}
    />
  )
}
