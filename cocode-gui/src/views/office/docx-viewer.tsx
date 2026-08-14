import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { EmptyState, Skeleton } from '@cocode/ui'
import type { FileViewerProps } from '../../panels/preview/viewers.ts'

function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function DocxViewer({ path, base64, byteLength }: FileViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const host = hostRef.current
    if (host === null || base64 === undefined) {
      setLoading(false)
      setError(base64 === undefined ? '缺少文件字节' : undefined)
      return
    }
    let cancelled = false
    setLoading(true)
    void import('docx-preview').then(async mod => {
      if (cancelled) return
      host.innerHTML = ''
      try {
        await mod.renderAsync(bytesOf(base64), host, undefined, { inWrapper: true, ignoreWidth: true })
        if (!cancelled) setError(undefined)
      }
      catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
      finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [base64])

  if (base64 === undefined) {
    return (
      <EmptyState
        icon={FileText}
        title="无法预览 Word"
        description={`缺少字节内容（${String(byteLength ?? 0)} bytes）。`}
        className="m-4"
      />
    )
  }

  return (
    <div className="relative h-full overflow-auto bg-surface-sunken p-3">
      {loading ? <div className="flex flex-col gap-2 p-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-4" />)}</div> : null}
      {error === undefined ? null : <p className="mb-2 text-[12px] text-danger">{error}</p>}
      <div ref={hostRef} className="docx-host mx-auto max-w-[860px] bg-background" data-path={path} />
    </div>
  )
}
