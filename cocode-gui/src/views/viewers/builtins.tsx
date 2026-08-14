/**
 * Built-in Preview viewers (lazy heavy deps where needed).
 */

import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react'
import { FileText } from 'lucide-react'
import { Button, EmptyState, Segmented, Skeleton, cn } from '@cocode/ui'
import { getDockPrefs } from '../../runtime/prefs/dock-prefs.ts'
import type { FileViewerProps } from '../../panels/preview/viewers.ts'
import { TextEditor } from '../text-editor.tsx'
import { MarkdownView } from '../markdown.tsx'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'] as const

function mediaTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'html' || ext === 'htm') return 'text/html'
  return 'application/octet-stream'
}

function base64ToObjectUrl(base64: string, mediaType: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }))
}

function downloadBase64(path: string, base64: string, mediaType: string): void {
  const url = base64ToObjectUrl(base64, mediaType)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = path.split('/').pop() ?? 'download'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ImageViewer({ path, base64, byteLength }: FileViewerProps) {
  const url = useMemo(() => {
    if (base64 === undefined) return undefined
    return base64ToObjectUrl(base64, mediaTypeFor(path))
  }, [base64, path])
  useEffect(() => () => { if (url !== undefined) URL.revokeObjectURL(url) }, [url])
  if (url === undefined) {
    return (
      <EmptyState
        icon={FileText}
        title="无法预览图片"
        description={`缺少字节内容（${String(byteLength ?? 0)} bytes）。`}
        className="m-4"
      />
    )
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-surface-sunken p-4">
      <img src={url} alt={path.split('/').pop() ?? path} className="max-h-full max-w-full object-contain" />
    </div>
  )
}

export function PdfViewer({ path, base64, byteLength }: FileViewerProps) {
  const url = useMemo(() => {
    if (base64 === undefined) return undefined
    return base64ToObjectUrl(base64, 'application/pdf')
  }, [base64])
  useEffect(() => () => { if (url !== undefined) URL.revokeObjectURL(url) }, [url])
  if (url === undefined) {
    return (
      <EmptyState
        icon={FileText}
        title="无法预览 PDF"
        description={`缺少字节内容（${String(byteLength ?? 0)} bytes）。`}
        className="m-4"
      />
    )
  }
  return <iframe title={path} src={url} className="h-full w-full border-0 bg-background" />
}

export function BinaryDownloadViewer({ path, base64, byteLength, text }: FileViewerProps) {
  return (
    <EmptyState
      icon={FileText}
      title="二进制文件"
      description={`此文件不能内联预览（${String(byteLength ?? text?.length ?? 0)} bytes）。`}
      className="m-4"
      action={base64 === undefined
        ? undefined
        : (
            <Button size="sm" onClick={() => downloadBase64(path, base64, mediaTypeFor(path))}>
              下载
            </Button>
          )}
    />
  )
}

export function MarkdownEditorViewer(props: FileViewerProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const draft = props.draft ?? props.text ?? ''
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <Segmented
          label="Markdown 模式"
          options={[
            { value: 'preview', label: '预览' },
            { value: 'edit', label: '编辑' },
          ]}
          value={mode}
          onChange={value => setMode(value as 'preview' | 'edit')}
        />
        {mode === 'edit'
          ? (
              <Button size="sm" variant="secondary" disabled={!props.dirty} onClick={() => props.onSave?.()}>
                保存
              </Button>
            )
          : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'preview'
          ? <div className="p-3"><MarkdownView text={draft} /></div>
          : (
              <TextEditor
                path={props.path}
                value={draft}
                dirty={props.dirty ?? false}
                onChange={next => props.onDraftChange?.(next)}
                onSave={() => props.onSave?.()}
                onAppendSelection={props.onAppendSelection}
              />
            )}
      </div>
    </div>
  )
}

export function CodeEditorViewer(props: FileViewerProps) {
  return (
    <TextEditor
      path={props.path}
      value={props.draft ?? props.text ?? ''}
      dirty={props.dirty ?? false}
      onChange={next => props.onDraftChange?.(next)}
      onSave={() => props.onSave?.()}
      onAppendSelection={props.onAppendSelection}
    />
  )
}

export function HtmlViewer(props: FileViewerProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [localUnlock, setLocalUnlock] = useState(false)
  const prefs = getDockPrefs()
  const draft = props.draft ?? props.text ?? ''
  const saved = props.text ?? ''
  const sandboxed = !prefs.htmlViewerNoSandbox && !localUnlock
  const sandbox = sandboxed
    ? 'allow-scripts'
    : 'allow-scripts allow-same-origin allow-forms allow-popups'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <Segmented
          label="HTML 模式"
          options={[
            { value: 'preview', label: '预览' },
            { value: 'edit', label: '源码' },
          ]}
          value={mode}
          onChange={value => setMode(value as 'preview' | 'edit')}
        />
        <div className="flex items-center gap-2">
          {mode === 'edit'
            ? (
                <Button size="sm" variant="secondary" disabled={!props.dirty} onClick={() => props.onSave?.()}>
                  保存
                </Button>
              )
            : (
                <Button size="sm" variant="secondary" onClick={() => setLocalUnlock(value => !value)}>
                  {sandboxed ? '临时解锁沙箱' : '恢复沙箱'}
                </Button>
              )}
        </div>
      </div>
      {mode === 'preview'
        ? (
            <>
              <div className={cn(
                'shrink-0 px-3 py-1.5 text-[11px]',
                sandboxed ? 'bg-surface-sunken text-muted-foreground' : 'bg-danger-soft text-danger',
              )}
              >
                {sandboxed
                  ? '沙箱预览：不透明源，仅显示已保存文件。'
                  : '沙箱已关闭：内容与界面同源，仅用于完全可信文件。'}
              </div>
              <iframe
                title={props.path}
                srcDoc={saved}
                sandbox={sandbox}
                referrerPolicy="no-referrer"
                className="min-h-0 flex-1 w-full border-0 bg-background"
              />
            </>
          )
        : (
            <TextEditor
              path={props.path}
              value={draft}
              dirty={props.dirty ?? false}
              onChange={next => props.onDraftChange?.(next)}
              onSave={() => props.onSave?.()}
              onAppendSelection={props.onAppendSelection}
            />
          )}
    </div>
  )
}

const DocxViewerLazy = lazy(async () => {
  const mod = await import('../office/docx-viewer.tsx')
  return { default: mod.DocxViewer }
})
const XlsxViewerLazy = lazy(async () => {
  const mod = await import('../office/xlsx-viewer.tsx')
  return { default: mod.XlsxViewer }
})
const PptxViewerLazy = lazy(async () => {
  const mod = await import('../office/pptx-viewer.tsx')
  return { default: mod.PptxViewer }
})

function LazyWrap({ View, props }: { View: ComponentType<FileViewerProps>; props: FileViewerProps }) {
  return (
    <Suspense fallback={(
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-4" />)}
      </div>
    )}
    >
      <View {...props} />
    </Suspense>
  )
}

export function DocxViewer(props: FileViewerProps) {
  return <LazyWrap View={DocxViewerLazy} props={props} />
}
export function XlsxViewer(props: FileViewerProps) {
  return <LazyWrap View={XlsxViewerLazy} props={props} />
}
export function PptxViewer(props: FileViewerProps) {
  return <LazyWrap View={PptxViewerLazy} props={props} />
}

export { IMAGE_EXTS }
