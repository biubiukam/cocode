import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { fileViewerRegistry } from '../../panels/preview/viewers.ts'
import { previewPanel } from '../../panels/preview/index.tsx'
import {
  BinaryDownloadViewer,
  CodeEditorViewer,
  DocxViewer,
  HtmlViewer,
  IMAGE_EXTS,
  ImageViewer,
  MarkdownEditorViewer,
  PdfViewer,
  PptxViewer,
  XlsxViewer,
} from '../../views/viewers/builtins.tsx'
import { DockWorkbenchSettings } from './ui/settings.tsx'

export const name = 'preview'
export const inject = ['panels', 'slots']

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, previewPanel)

  ctx.effect(() => fileViewerRegistry.register({
    id: 'image',
    exts: [...IMAGE_EXTS],
    priority: 80,
    binary: true,
    component: ImageViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'pdf',
    exts: ['pdf'],
    priority: 70,
    binary: true,
    component: PdfViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'docx',
    exts: ['docx'],
    priority: 60,
    binary: true,
    component: DocxViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'xlsx',
    exts: ['xlsx', 'xls', 'csv'],
    priority: 60,
    binary: true,
    component: XlsxViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'pptx',
    exts: ['pptx'],
    priority: 60,
    binary: true,
    component: PptxViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'markdown',
    exts: ['md', 'mdx', 'markdown'],
    priority: 50,
    component: MarkdownEditorViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'html',
    exts: ['html', 'htm'],
    priority: 50,
    component: HtmlViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'code',
    exts: [],
    priority: -100,
    component: CodeEditorViewer,
  }))
  ctx.effect(() => fileViewerRegistry.register({
    id: 'binary-download',
    exts: ['doc', 'xls', 'ppt', 'zip', 'gz', 'wasm', 'exe', 'dll'],
    priority: -50,
    binary: true,
    detect: (_path, head) => head !== undefined && head.includes('\u0000'),
    component: BinaryDownloadViewer,
  }))

  ctx.slots.register({
    name: 'shell.palette',
    order: 41,
    inject: () => ({
      id: 'panel.preview',
      label: `打开 ${previewPanel.title}`,
      group: '面板',
      icon: 'file-text',
      run: () => { ctx.get('layout')?.store.getState().openPanel('preview') },
    }),
  }, Empty)

  ctx.slots.register({
    name: 'settings.section',
    order: 35,
    inject: () => ({
      id: 'dock-workbench',
      group: '工作台',
      label: 'Dock 面板',
      description: '终端配额、浏览器链接与预览沙箱。',
      icon: 'panels',
    }),
  }, DockWorkbenchSettings)
}

function Empty() {
  return null
}
