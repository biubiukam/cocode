import type { ReactNode, SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { readonly size?: number }

function Icon(props: IconProps, children: ReactNode) {
  const { size = 16, ...rest } = props
  return <svg {...rest} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">{children}</svg>
}

/** Shared file outline used by file-kind and generic document icons. */
function FileIcon(props: IconProps, detail: ReactNode) {
  return Icon(props, <>
    <path d="M4.25 2.5h5.1L11.75 5v8.5h-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M9.25 2.75V5h2.25" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    {detail}
  </>)
}

export function PanelRightIcon(props: IconProps) {
  return Icon(props, <><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><rect x="10.5" y="3.25" width="2.75" height="9.5" rx="1" fill="currentColor" /></>)
}

export function PanelBottomIcon(props: IconProps) {
  return Icon(props, <><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><rect x="3.25" y="10" width="9.5" height="2.75" rx="1" fill="currentColor" /></>)
}

export function CloseIcon(props: IconProps) {
  return Icon(props, <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)
}

export function PlusIcon(props: IconProps) {
  return Icon(props, <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)
}

export function MoveIcon(props: IconProps) {
  return Icon(props, <><path d="m5 3-2 2 2 2M11 13l2-2-2-2M3 5h7M13 11H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></>)
}

export function FilesIcon(props: IconProps) {
  return Icon(props, <><path d="M3 3.5h6l2 2v7H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M5 3.5V2.5h6l2 2v7h-2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></>)
}

export function GitIcon(props: IconProps) {
  return Icon(props, <><circle cx="4" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M4 5.5v2a2 2 0 0 0 2 2h2M12 5.5v2a2 2 0 0 1-2 2H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>)
}

export function TerminalIcon(props: IconProps) {
  return Icon(props, <><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="m4.5 6.25 2.25 1.75L4.5 9.75M8.5 10.4h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></>)
}

export function SearchIcon(props: IconProps) {
  return Icon(props, <><circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" /><path d="m10.2 10.2 3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>)
}

export function ChevronIcon(props: IconProps) {
  return Icon(props, <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />)
}

export function ChevronLeftIcon(props: IconProps) {
  return Icon(props, <path d="m10 4-4 4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />)
}

export function ReloadIcon(props: IconProps) {
  return Icon(props, <>
    <path d="M14 8a6 6 0 1 1-6-6c1.68 0 3.29.71 4.49 1.83L14 5.33" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2v3.33h-3.33" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function ArrowRightIcon(props: IconProps) {
  return Icon(props, <path d="M3.5 8h9M8.25 4.25 12.5 8l-4.25 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />)
}

export function ExternalIcon(props: IconProps) {
  return Icon(props, <>
    <path d="M9.5 2.5h4v4M7 9l6.5-6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 9.5V12a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 12V5a1.5 1.5 0 0 1 1.5-1.5H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function FolderGlyph(props: IconProps) {
  return Icon(props, <path d="M2.5 4.25h4.1l1.2 1.35H13.5v6.9H2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />)
}

export function FileGlyph(props: IconProps) {
  return Icon(props, <path d="M4.25 2.5h5.1L11.75 5v8.5h-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />)
}

export function BrowserIcon(props: IconProps) {
  return Icon(props, <>
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.75 8h10.5M8 2.5c1.75 1.9 2.6 3.5 2.6 5.5S9.75 11.6 8 13.5M8 2.5c-1.75 1.9-2.6 3.5-2.6 5.5s.85 3.6 2.6 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </>)
}

export function JobsIcon(props: IconProps) {
  return Icon(props, <>
    <rect x="2.5" y="2.75" width="11" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5.5 5.75h5M5.5 8h5M5.5 10.25h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </>)
}

export function SubagentsIcon(props: IconProps) {
  return Icon(props, <>
    <circle cx="5.75" cy="5.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="10.25" cy="5.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.75 13.25c.2-2.3 1.4-3.5 3-3.5s2.8 1.2 3 3.5M8.25 13.25c.2-2.3 1.4-3.5 3-3.5s2.8 1.2 3 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </>)
}

export function PreviewIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M6.6 7.4 8 8.5l1.4-1.1 1.7 2.1H4.9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="6.1" cy="6.3" r=".6" stroke="currentColor" strokeWidth="1.3" />
  </>)
}

export function TextFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M6 7h4M6 8.75h4M6 10.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </>)
}

export function CodeFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="m6.3 7.1-1.7 1.35 1.7 1.35M9.7 7.1l1.7 1.35-1.7 1.35" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function MarkdownFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M6 10.5V6.9l1.35 1.9 1.35-1.9v3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function HtmlFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="m6.2 7-1.5 1.25L6.2 9.5M9.8 7l1.5 1.25L9.8 9.5M8 10.4V6.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function PdfFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M6 6.9h1.3a1 1 0 0 1 0 2H6v1.6M9.25 6.9h1.5l-1.1 1.15 1.1 1.15H9.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function JsonFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M7 6.9 6.1 8l.9 1.1M9 6.9l.9 1.1L9 9.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>)
}

export function ArchiveFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M4.5 6.25h7v4.25h-7zM6.4 6.25V4.75h3.2v1.5M7.4 8h1.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </>)
}

export function ImageFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="M6.7 7.2 8.2 8.6l1.3-1.1 1.9 2.6H4.9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="6.05" cy="6.25" r=".6" stroke="currentColor" strokeWidth="1.3" />
  </>)
}

export function MediaFileIcon(props: IconProps) {
  return FileIcon(props, <>
    <path d="m7.25 7.25 2.6 1.6-2.6 1.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </>)
}

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "heic", "ico", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp"])
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"])
const HTML_EXTENSIONS = new Set(["htm", "html"])
const JSON_EXTENSIONS = new Set(["json", "jsonc", "jsonl"])
const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "deb", "dmg", "gz", "iso", "pkg", "rar", "rpm", "tar", "tgz", "xz", "zip"])
const MEDIA_EXTENSIONS = new Set(["aac", "avi", "flac", "m4a", "m4v", "mkv", "mov", "mp3", "mp4", "ogg", "opus", "wav", "webm", "wmv"])
const CODE_EXTENSIONS = new Set([
  "c", "cc", "clj", "cpp", "cs", "css", "go", "graphql", "h", "hpp", "ini", "java", "js", "jsx",
  "kt", "less", "lua", "php", "proto", "py", "rb", "rs", "scss", "sh", "sql", "swift", "toml",
  "ts", "tsx", "vue", "xml", "yaml", "yml",
])

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).at(-1) ?? path
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return ""
  return name.slice(dot + 1).toLowerCase()
}

/** Pick a tab icon from the file path's extension, falling back to text. */
export function fileTypeIcon(path: string): ReactNode {
  const extension = extensionOf(path)
  if (IMAGE_EXTENSIONS.has(extension)) return <ImageFileIcon size={15} />
  if (MARKDOWN_EXTENSIONS.has(extension)) return <MarkdownFileIcon size={15} />
  if (HTML_EXTENSIONS.has(extension)) return <HtmlFileIcon size={15} />
  if (extension === "pdf") return <PdfFileIcon size={15} />
  if (JSON_EXTENSIONS.has(extension)) return <JsonFileIcon size={15} />
  if (ARCHIVE_EXTENSIONS.has(extension)) return <ArchiveFileIcon size={15} />
  if (MEDIA_EXTENSIONS.has(extension)) return <MediaFileIcon size={15} />
  if (CODE_EXTENSIONS.has(extension)) return <CodeFileIcon size={15} />
  return <TextFileIcon size={15} />
}
