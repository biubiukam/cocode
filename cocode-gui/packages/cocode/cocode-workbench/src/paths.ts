/**
 * Posix-first path helpers shared by the workbench host and client bundles.
 *
 * Wire paths in the workbench protocol are forward-slash on every platform,
 * including Windows absolute paths ("C:/work/repo"). Native separators can
 * still enter at the boundary — host fs APIs, git output, or a user-typed
 * target on Windows — so every helper tolerates backslash input and produces
 * posix output. Keep this module dependency-free: the client bundle runs in
 * the browser where node built-ins do not exist.
 */

/** Normalize any path spelling to forward slashes. */
export function toPosix(path: string): string {
  return path.replaceAll("\\", "/")
}

/** True for absolute paths in posix, Windows drive, or UNC spelling. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith("\\\\")
}

/** True when the value contains a separator in either spelling. */
export function hasSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\")
}

export function joinPath(root: string, name: string): string {
  const posixRoot = toPosix(root)
  return posixRoot.endsWith("/") ? `${posixRoot}${name}` : `${posixRoot}/${name}`
}

export function baseName(path: string): string {
  const posix = toPosix(path)
  const boundary = posix.lastIndexOf("/")
  return boundary < 0 ? posix : posix.slice(boundary + 1)
}

export function parentOf(path: string): string {
  const posix = toPosix(path)
  const boundary = posix.lastIndexOf("/")
  return boundary <= 0 ? posix : posix.slice(0, boundary)
}

/** Workspace-relative form used by the "copy relative path" command. */
export function relativeTo(root: string, path: string): string {
  const posixRoot = toPosix(root)
  const posixPath = toPosix(path)
  const prefix = posixRoot.endsWith("/") ? posixRoot : `${posixRoot}/`
  return posixPath.startsWith(prefix) ? posixPath.slice(prefix.length) : posixPath
}

/** A name the host can accept: no separators and no directory shorthand. */
export function isValidName(name: string): boolean {
  return name !== "" && !hasSeparator(name) && name !== "." && name !== ".."
}

/** True when `path` is the root itself or sits under it. */
export function isUnder(root: string, path: string): boolean {
  const posixRoot = toPosix(root)
  const posixPath = toPosix(path)
  return (
    posixPath === posixRoot ||
    posixPath.startsWith(posixRoot.endsWith("/") ? posixRoot : `${posixRoot}/`)
  )
}
