import { isAbsolutePath, parentOf } from "../paths.ts"
import { fileUrl } from "./runtime-api.ts"

/**
 * A code span or fenced block (group 1) OR a markdown image (groups 2-4).
 * The code alternative is listed first so image syntax quoted inside sample
 * code is matched as code and left untouched by the rewrite below.
 */
const IMAGE_OR_CODE = /(`+)[\s\S]*?\1|!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)/g

/** Anything already carrying a scheme (http:, data:, //host) is left alone. */
const ABSOLUTE_TARGET = /^(?:[a-z][a-z0-9+.\-]*:|\/\/)/i

/** Markdown targets may be percent-encoded; the host route wants the raw path. */
function decodeTarget(target: string): string {
  try { return decodeURIComponent(target) } catch { return target }
}

/**
 * Rewrite workspace-relative image targets into absolute workbench file URLs.
 * The markdown renderer drops every non-http(s) image source, so a local
 * document would otherwise show alt text where its own screenshots belong.
 * The host route resolves the joined path and rejects anything outside the
 * workspace, so no extra containment check is needed here.
 * @param source - the markdown document text.
 * @param path - absolute path of the document, the base for relative targets.
 * @param sessionId - session whose workspace serves the files.
 */
export function resolveMarkdownImages(source: string, path: string, sessionId: string | undefined): string {
  const directory = parentOf(path)
  return source.replace(IMAGE_OR_CODE, (
    match: string,
    fence: string | undefined,
    alt: string | undefined,
    target: string | undefined,
    title: string | undefined,
  ) => {
    if (fence !== undefined || target === undefined) return match
    if (ABSOLUTE_TARGET.test(target)) return match
    const decoded = decodeTarget(target)
    const absolute = isAbsolutePath(decoded) ? decoded : `${directory}/${decoded}`
    // Angle brackets keep the encoded URL parseable when the path contains
    // characters encodeURIComponent leaves intact, such as parentheses.
    return `![${alt ?? ""}](<${fileUrl(sessionId, absolute)}>${title ?? ""})`
  })
}
