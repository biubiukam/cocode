/**
 * Inline PPTX preview via lazily loaded @aiden0z/pptx-renderer.
 */

import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { Button, EmptyState, Skeleton, cn } from '@cocode/ui'
import type { FileViewerProps } from '../../panels/preview/viewers.ts'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; count: number }
  | { status: 'error'; message: string }

function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function PptxViewer({ path, base64, byteLength }: FileViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<{ destroy(): void; goToSlide(index: number, opts?: { behavior?: string }): Promise<void>; currentSlideIndex: number; slideCount: number } | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [slide, setSlide] = useState(0)
  const [navigating, setNavigating] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (host === null || base64 === undefined) {
      setLoad({ status: 'error', message: base64 === undefined ? '缺少文件字节' : '预览容器不可用' })
      return
    }
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    setSlide(0)
    void (async () => {
      try {
        const { PptxViewer: Viewer, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer')
        if (controller.signal.aborted) return
        const viewer = await Viewer.open(bytesOf(base64), host, {
          renderMode: 'slide',
          fitMode: 'contain',
          lazyMedia: true,
          lazySlides: true,
          pdfjs: false,
          signal: controller.signal,
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          onSlideChange: (index: number) => {
            if (!controller.signal.aborted) setSlide(index)
          },
        })
        if (controller.signal.aborted) {
          viewer.destroy()
          return
        }
        viewerRef.current = viewer
        setSlide(viewer.currentSlideIndex)
        setLoad({ status: 'ready', count: viewer.slideCount })
      }
      catch (error: unknown) {
        if (controller.signal.aborted) return
        try { viewerRef.current?.destroy() } catch { /* ignore */ }
        viewerRef.current = null
        host.innerHTML = ''
        setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => {
      controller.abort()
      try { viewerRef.current?.destroy() } catch { /* ignore */ }
      viewerRef.current = null
      host.innerHTML = ''
    }
  }, [base64])

  const navigate = (target: number) => {
    const viewer = viewerRef.current
    if (viewer === null || load.status !== 'ready' || navigating) return
    const next = Math.max(0, Math.min(load.count - 1, target))
    if (next === slide) return
    setNavigating(true)
    void viewer.goToSlide(next, { behavior: 'auto' }).then(() => {
      setSlide(viewer.currentSlideIndex)
    }).catch((error: unknown) => {
      setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }).finally(() => setNavigating(false))
  }

  const download = () => {
    if (base64 === undefined) return
    const url = URL.createObjectURL(new Blob([bytesOf(base64)], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = path.split('/').pop() ?? 'deck.pptx'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (base64 === undefined) {
    return (
      <EmptyState
        icon={FileText}
        title="无法预览 PowerPoint"
        description={`缺少字节内容（${String(byteLength ?? 0)} bytes）。`}
        className="m-4"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <Button size="sm" variant="secondary" disabled={load.status !== 'ready' || slide <= 0 || navigating} onClick={() => navigate(slide - 1)}>
          上一页
        </Button>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {load.status === 'ready' ? `${String(slide + 1)} / ${String(load.count)}` : '– / –'}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={load.status !== 'ready' || (load.status === 'ready' && slide >= load.count - 1) || navigating}
          onClick={() => navigate(slide + 1)}
        >
          下一页
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={download}>下载</Button>
      </div>
      <div className="relative min-h-0 flex-1 bg-surface-sunken">
        <div ref={hostRef} className={cn('h-full w-full', load.status === 'ready' ? '' : 'opacity-0')} />
        {load.status === 'loading'
          ? (
              <div className="absolute inset-0 flex flex-col gap-2 p-4">
                {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-4" />)}
              </div>
            )
          : null}
        {load.status === 'error'
          ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <EmptyState icon={FileText} title="PPTX 预览失败" description={load.message} action={<Button size="sm" onClick={download}>下载文件</Button>} />
              </div>
            )
          : null}
      </div>
    </div>
  )
}
