import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { CodeBlock, MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives"
import type { WorkbenchPanelProps } from "./model.ts"
import { ExternalIcon, PreviewIcon, ReloadIcon } from "./icons.tsx"
import type { DesktopApi } from "../../../../../src/contracts/ipc/desktop.contract.ts"
import { State, message, useRemote } from "./panel-state.tsx"
import { fileUrl, workbenchRequest } from "./runtime-api.ts"
import { resolveMarkdownImages } from "./markdown-assets.ts"
import { baseName, relativeTo } from "../paths.ts"
import { GitDiffView } from "./git-diff.tsx"
import type { GitGroup } from "./git-client.ts"
import { t } from "./locales.ts"
import css from "./preview.module.css"

/** Source is the editable face; preview is always read-only. */
type ViewMode = "source" | "preview"

/** Matches preview.module.css crossfade duration. */
const MODE_CROSSFADE_MS = 200

/** Crossfade between source and preview; only one face stays mounted at rest. */
function ModeCrossfade(props: { readonly mode: ViewMode; readonly path: string; readonly source: ReactNode; readonly preview: ReactNode }) {
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current
  const prevMode = useRef(props.mode)
  const [resident, setResident] = useState<readonly ViewMode[]>(() => [props.mode])

  useEffect(() => {
    prevMode.current = props.mode
    setResident([props.mode])
  }, [props.path])

  useEffect(() => {
    if (reducedMotion || props.mode === prevMode.current) return
    prevMode.current = props.mode
    setResident(prev => prev.includes(props.mode) ? prev : [...prev, props.mode])
    const timer = window.setTimeout(() => setResident([props.mode]), MODE_CROSSFADE_MS)
    return () => window.clearTimeout(timer)
  }, [props.mode, reducedMotion])

  if (reducedMotion) {
    return <div className={css.body}>{props.mode === "source" ? props.source : props.preview}</div>
  }

  return <div className={css.body}>
    {resident.includes("source") && <div className={css.face} data-visible={props.mode === "source" || undefined}>{props.source}</div>}
    {resident.includes("preview") && <div className={css.face} data-visible={props.mode === "preview" || undefined}>{props.preview}</div>}
  </div>
}

/** How the preview face draws a file; `undefined` means it has no preview. */
type PreviewKind = "markdown" | "html" | "image" | "pdf" | "code"

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"])
const HTML_EXTENSIONS = new Set(["html", "htm"])
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"])

interface FileRead {
  readonly kind: string
  readonly content?: string
  readonly truncated?: boolean
  /** False when the session's sandbox mode forbids writing this path. */
  readonly writable?: boolean
}

function previewKind(extension: string | undefined, fileKind: string | undefined): PreviewKind | undefined {
  if (extension !== undefined && IMAGE_EXTENSIONS.has(extension)) return "image"
  if (fileKind === "binary") return extension === "pdf" ? "pdf" : undefined
  if (extension !== undefined && MARKDOWN_EXTENSIONS.has(extension)) return "markdown"
  if (extension !== undefined && HTML_EXTENSIONS.has(extension)) return "html"
  return "code"
}

/** Documents and graphics open rendered; source-first formats open as source. */
function preferredMode(kind: PreviewKind | undefined, hasSource: boolean): ViewMode {
  if (!hasSource) return "preview"
  return kind === undefined || kind === "code" ? "source" : "preview"
}

/** Show a file under the current workspace, falling back to its bare name. */
function workspaceRelativePath(root: string | undefined, path: string): string {
  if (root === undefined || root === "") return baseName(path)
  const relative = relativeTo(root, path)
  return relative === "" ? baseName(path) : relative
}

/** Cache-bust binary previews when the user explicitly reloads from disk. */
function previewFileUrl(sessionId: string | undefined, path: string, revision: number): string {
  const url = new URL(fileUrl(sessionId, path))
  if (revision > 0) url.searchParams.set("_", String(revision))
  return url.href
}

/** 源代码管理面板打开一行时带来的差异请求，其余目标一律按文件预览处理。 */
interface DiffTarget {
  readonly repoPath: string
  readonly group: GitGroup
}

function diffTarget(data: unknown): DiffTarget | undefined {
  if (data === null || typeof data !== "object") return undefined
  const value = data as Partial<DiffTarget> & { kind?: unknown }
  if (value.kind !== "diff" || typeof value.repoPath !== "string" || typeof value.group !== "string") return undefined
  return { repoPath: value.repoPath, group: value.group }
}

/**
 * 预览面板的入口。差异与文件是两套完全不同的读取与呈现，在这里就分开，
 * 免得文件预览为一个 diff 目标白读一次内容。
 */
export function PreviewPanel(props: WorkbenchPanelProps) {
  const diff = diffTarget(props.instance.target?.data)
  if (diff !== undefined) {
    return <GitDiffView sessionId={props.scope.sessionId} cwd={props.scope.cwd} repoPath={diff.repoPath} group={diff.group} />
  }
  return <FilePreview {...props} />
}

function FilePreview(props: WorkbenchPanelProps) {
  const sessionId = props.scope.sessionId
  const cwd = props.scope.cwd
  const path = props.instance.target?.path
  const extension = path?.split(".").at(-1)?.toLowerCase()
  // Bumped after a write so the saved file is re-read and the editor baseline
  // matches what is actually on disk.
  const [revision, setRevision] = useState(0)
  const remote = useRemote<FileRead | undefined>(async signal => {
    if (sessionId === undefined || path === undefined) return undefined
    return workbenchRequest<FileRead>("fs.read", { sessionId, path, cwd }, signal)
  }, [sessionId, path, revision, cwd])
  // Draft and mode are keyed by path, so opening another file in this panel
  // drops both instead of leaking one file's edits or choice into the next.
  const [draft, setDraft] = useState<{ readonly path: string; readonly text: string }>()
  const [choice, setChoice] = useState<{ readonly path: string; readonly mode: ViewMode }>()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [openingExternal, setOpeningExternal] = useState(false)
  const [confirmRefresh, setConfirmRefresh] = useState(false)

  useEffect(() => {
    setConfirmRefresh(false)
  }, [path])

  const file = remote.value
  const stored = file?.content ?? ""
  const text = draft !== undefined && draft.path === path ? draft.text : stored
  const kind = previewKind(extension, file?.kind)
  const markdown = useMemo(
    () => kind === "markdown" && path !== undefined ? resolveMarkdownImages(text, path, sessionId) : text,
    [kind, text, path, sessionId],
  )
  // 保持引用稳定，MarkdownText 才能复用它的渲染缓存；语言切换时才换一份。
  const copyLabel = t("common.copy")
  const copiedLabel = t("common.copied")
  const codeLabels = useMemo(() => ({ copyLabel, copiedLabel }), [copyLabel, copiedLabel])

  if (path === undefined) return <State empty={t("preview.pickFile")} icon={<PreviewIcon size={18} />} />
  if (remote.loading || remote.error !== undefined) return <State loading={remote.loading} error={remote.error} />

  const hasSource = file?.kind === "text"
  // A truncated read holds only the first megabytes; writing it back would
  // destroy the tail, so such a file stays readable but never editable. A file
  // the sandbox mode puts out of write reach opens read-only for the same
  // reason: better than accepting edits the save would reject.
  const editable = hasSource && file?.truncated !== true && file.writable !== false
  const dirty = editable && text !== stored
  const mode = choice !== undefined && choice.path === path ? choice.mode : preferredMode(kind, hasSource)

  const refresh = (): void => {
    if (remote.loading) return
    setDraft(undefined)
    setNotice(undefined)
    setConfirmRefresh(false)
    setRevision(value => value + 1)
  }

  const requestRefresh = (): void => {
    if (remote.loading) return
    if (dirty) {
      setConfirmRefresh(true)
      return
    }
    refresh()
  }

  const save = (): void => {
    if (sessionId === undefined || !dirty || saving) return
    setSaving(true)
    void workbenchRequest("fs.write", { sessionId, path, content: text }).then(
      () => { setDraft(undefined); setNotice(undefined); setRevision(value => value + 1) },
      error => setNotice(message(error)),
    ).finally(() => setSaving(false))
  }

  const openWithDefaultApp = (): void => {
    const api = getDesktopApi()?.localFiles
    if (api === undefined || openingExternal) return
    setOpeningExternal(true)
    setNotice(undefined)
    void api.open({ path }).catch(error => setNotice(message(error))).finally(() => setOpeningExternal(false))
  }

  const sourceView = <textarea
    className={css.editor}
    value={text}
    readOnly={!editable}
    spellCheck={false}
    onChange={event => setDraft({ path, text: event.target.value })}
    onKeyDown={event => {
      if (event.key !== "s" || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      save()
    }}
  />

  const previewView = ((): ReactNode => {
    switch (kind) {
      case "markdown":
        return <div className={css.scroll}>
          <article className={css.document}><MarkdownText text={markdown} codeLabels={codeLabels} /></article>
        </div>
      case "html":
        return <iframe className={css.frame} sandbox="allow-forms allow-scripts" srcDoc={text} title={props.instance.title} />
      case "pdf":
        return <iframe className={css.frame} src={previewFileUrl(sessionId, path, revision)} title={props.instance.title} />
      case "image":
        return <div className={css.canvas}><img className={css.image} src={previewFileUrl(sessionId, path, revision)} alt={props.instance.title} /></div>
      case "code":
        return <div className={css.scroll}><CodeBlock code={text} lang={extension} className={css.code} /></div>
      default:
        return <div className={css.unsupported}>
          <PreviewIcon size={28} />
          <p className={css.unsupportedText}>{t("preview.unsupported")}</p>
          {getDesktopApi()?.localFiles === undefined
            ? <p className={css.unavailable}>{t("preview.openUnavailable")}</p>
            : <button
              type="button"
              className={css.externalOpen}
              disabled={openingExternal}
              onClick={openWithDefaultApp}
            ><ExternalIcon size={15} />{t(openingExternal ? "preview.opening" : "preview.openDefault")}</button>}
        </div>
    }
  })()

  return <div className={css.panel}>
    <div className={css.toolbar}>
      <span className={css.name} title={path}>{workspaceRelativePath(cwd, path)}</span>
      {file?.truncated === true
        ? <span className={css.flag}>{t("preview.truncated")}</span>
        : hasSource && !editable && <span className={css.flag}>{t("preview.readOnly")}</span>}
      <span className={css.spacer} />
      <button
        type="button"
        className={css.refresh}
        title={t("preview.refresh")}
        aria-label={t("preview.refresh")}
        disabled={remote.loading}
        onClick={requestRefresh}
      ><ReloadIcon size={16} /></button>
      {hasSource && kind !== undefined && <div className={css.modes} data-mode={mode} role="group" aria-label={t("preview.viewMode")}>
        <div className={css.modeThumb} aria-hidden="true" />
        <button type="button" className={css.mode} data-active={mode === "source" || undefined} onClick={() => setChoice({ path, mode: "source" })}>{t("preview.source")}</button>
        <button type="button" className={css.mode} data-active={mode === "preview" || undefined} onClick={() => setChoice({ path, mode: "preview" })}>{t("preview.preview")}</button>
      </div>}
      {dirty && <button type="button" className={css.save} disabled={saving} onClick={save}>{t(saving ? "preview.saving" : "preview.save")}</button>}
    </div>
    {confirmRefresh && <div className={css.confirm}>
      <span className={css.confirmText}>{t("preview.confirmRefresh", { name: workspaceRelativePath(cwd, path) })}</span>
      <span className={css.confirmActions}>
        <button type="button" className={css.confirmButton} onClick={() => setConfirmRefresh(false)}>{t("common.cancel")}</button>
        <button type="button" className={css.confirmButton} data-danger onClick={refresh}>{t("common.confirm")}</button>
      </span>
    </div>}
    {notice !== undefined && !confirmRefresh && <div className={css.notice}>{notice}</div>}
    <ModeCrossfade mode={mode} path={path} source={sourceView} preview={previewView} />
  </div>
}

function getDesktopApi(): DesktopApi | undefined {
  return (window as Window & { readonly desktopApi?: DesktopApi }).desktopApi
}
