/**
 * Preview: stable working surface for one target — session artifact or workspace file.
 * Workspace files dispatch through the file-viewer registry (editable text + rich previews).
 */

import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { EmptyState, Skeleton } from '@cocode/ui'
import type { ToolResultView } from '@cocode/gui-connection'
import { definePanel, type PanelProps } from '../types.ts'
import {
  useActiveSession, useConnectionService, useSessionDirectory, useSessionSnapshot,
} from '../../shell/runtime-context.tsx'
import { DiffView } from '../../views/diff-view.tsx'
import { CodeView } from '../../views/code-view.tsx'
import { MarkdownView } from '../../views/markdown.tsx'
import { SessionImage } from '../../views/session-image.tsx'
import { appendComposerDraft } from '../../runtime/composer/draft.ts'
import { registerDirtyGuard } from '../../runtime/preview/dirty.ts'
import { fileViewerRegistry } from './viewers.ts'
import { useToast } from '../../shell/overlay/toast.tsx'
import type { ToolNode } from '../../runtime/index.ts'

export type PreviewTarget =
  | { kind: 'diff'; callId: string; path: string }
  | { kind: 'read'; callId: string; path: string }
  | { kind: 'image'; attachmentId: string; path: string }
  | { kind: 'file'; path: string }

function toKey(target: PreviewTarget): string {
  if (target.kind === 'file') return `file:${target.path}`
  const id = target.kind === 'image' ? target.attachmentId : target.callId
  return `${target.kind}:${id}:${target.path}`
}

function fromKey(key: string): PreviewTarget {
  const [kind = 'diff', ...rest] = key.split(':')
  if (kind === 'file') return { kind: 'file', path: rest.join(':') }
  const [id = '', ...pathParts] = rest
  const path = pathParts.join(':')
  if (kind === 'image') return { kind: 'image', attachmentId: id, path }
  if (kind === 'read') return { kind: 'read', callId: id, path }
  return { kind: 'diff', callId: id, path }
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(path)
}

function findTool(nodes: readonly { kind: string }[], callId: string): ToolNode | undefined {
  return nodes.find((node): node is ToolNode => node.kind === 'tool' && (node as ToolNode).callId === callId)
}

function readLines(view: ToolResultView | undefined): { number: number; text: string }[] | undefined {
  return view?.card === 'read' ? view.lines : undefined
}

function WorkspaceFilePreview({
  path,
  instanceKey,
}: {
  path: string
  instanceKey: string
}) {
  const connectionService = useConnectionService()
  const directory = useSessionDirectory()
  const workspaceId = directory.activeWorkspaceId
  const toast = useToast()
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; text?: string; base64?: string; byteLength: number; binary: boolean }
    | { status: 'error'; message: string }
  >({ status: 'loading' })
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [savedText, setSavedText] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  const dirty = draft !== undefined && savedText !== undefined && draft !== savedText

  useEffect(() => registerDirtyGuard(instanceKey, {
    isDirty: () => dirty,
    confirmClose: () => globalThis.confirm('有未保存的更改，确定关闭并丢弃吗？'),
  }), [instanceKey, dirty])

  useEffect(() => {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined) {
      setState({ status: 'error', message: '没有可用的项目连接。' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    const probe = fileViewerRegistry.match(path)
    const includeBase64 = probe?.binary === true
      || /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|pdf|docx|xlsx|pptx)$/i.test(path)
    void transport.call('fs.read', {
      workspaceId,
      path,
      includeBase64: includeBase64 || undefined,
      maxBytes: includeBase64 ? 20_971_520 : undefined,
    }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setState({ status: 'error', message: result.error.message })
        return
      }
      if (result.value.kind === 'binary') {
        setSavedText(undefined)
        setDraft(undefined)
        setState({
          status: 'ready',
          binary: true,
          byteLength: result.value.byteLength,
          base64: result.value.base64,
        })
        return
      }
      setSavedText(result.value.text)
      setDraft(result.value.text)
      setState({
        status: 'ready',
        binary: false,
        text: result.value.text,
        byteLength: result.value.byteLength,
      })
    })
    return () => { cancelled = true }
  }, [connectionService, workspaceId, path, tick])

  const viewer = useMemo(() => {
    if (state.status !== 'ready') return undefined
    const head = state.text?.slice(0, 256)
    return fileViewerRegistry.match(path, head)
  }, [path, state])

  const save = async () => {
    const transport = connectionService.activeTransport
    if (transport === undefined || workspaceId === undefined || draft === undefined) return
    const result = await transport.call('fs.write', { workspaceId, path, text: draft })
    if (!result.ok) {
      toast.push('warning', result.error.message)
      return
    }
    setSavedText(draft)
    toast.push('success', '已保存')
    setTick(value => value + 1)
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-4" />)}
      </div>
    )
  }
  if (state.status === 'error') {
    return <EmptyState icon={FileText} title="无法打开文件" description={state.message} className="m-4" />
  }
  if (workspaceId === undefined) {
    return <EmptyState icon={FileText} title="没有选中的项目" description="选择项目后再打开文件。" className="m-4" />
  }

  const Viewer = viewer?.component
  if (Viewer === undefined) {
    return <EmptyState icon={FileText} title="没有可用的预览器" description={path} className="m-4" />
  }

  return (
    <Viewer
      path={path}
      workspaceId={workspaceId}
      text={state.text}
      base64={state.base64}
      byteLength={state.byteLength}
      draft={draft}
      dirty={dirty}
      onDraftChange={setDraft}
      onSave={() => { void save() }}
      onAppendSelection={text => {
        appendComposerDraft(`\n\`\`\`\n// ${path}\n${text}\n\`\`\`\n`)
      }}
    />
  )
}

function PreviewPanel({ target }: PanelProps<PreviewTarget>) {
  const session = useActiveSession()
  const snapshot = useSessionSnapshot(session)
  const nodes = snapshot?.nodes ?? []
  const key = toKey(target)

  const content = useMemo(() => {
    if (target.kind === 'file') return { kind: 'file' as const }
    if (target.kind === 'image') return { kind: 'image' as const }
    const tool = findTool(nodes, target.callId)
    if (tool === undefined) return { kind: 'missing' as const }
    if (target.kind === 'read') {
      const lines = readLines(tool.resultView)
      if (lines === undefined) return { kind: 'missing' as const }
      return {
        kind: 'read' as const,
        code: lines.map(line => line.text).join('\n'),
        startLine: lines[0]?.number ?? 1,
      }
    }
    const view = tool.resultView?.card === 'diff' ? tool.resultView : (tool.callView?.card === 'diff' ? tool.callView : undefined)
    const diff = view?.diffs.find(entry => entry.path === target.path) ?? view?.diffs[0]
    if (diff === undefined) return { kind: 'missing' as const }
    return { kind: 'diff' as const, diff }
  }, [nodes, target])

  if (content.kind === 'file' && target.kind === 'file') {
    return <WorkspaceFilePreview path={target.path} instanceKey={key} />
  }

  if (content.kind === 'missing') {
    return (
      <EmptyState
        icon={FileText}
        title="内容已不在当前窗口内"
        description="这条预览引用的工具调用不在当前加载的事件窗口中。向上加载更多历史，或关闭这个标签。"
        className="m-4"
      />
    )
  }

  return (
    <div className="h-full overflow-auto p-3">
      {content.kind === 'diff' ? <DiffView diff={content.diff} /> : null}
      {content.kind === 'read'
        ? isMarkdownPath(target.path)
          ? <MarkdownView text={content.code} />
          : <CodeView code={content.code} path={target.path} startLine={content.startLine} showLineNumbers />
        : null}
      {content.kind === 'image' && target.kind === 'image'
        ? <SessionImage attachmentId={target.attachmentId} name={target.path} />
        : null}
    </div>
  )
}

export const previewPanel = definePanel<PreviewTarget>({
  id: 'preview',
  title: '预览',
  icon: FileText,
  scope: 'session',
  multiInstance: true,
  preferredDock: 'right',
  describe: target => target.path.split('/').pop() ?? target.path,
  toKey,
  fromKey,
  render: props => <PreviewPanel {...props} />,
})
