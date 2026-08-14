/**
 * Optional conversation → Browser panel link takeover (RFC §3.6).
 */

type Opener = (url: string) => void

let opener: Opener | undefined

export function registerBrowserLinkOpener(next: Opener): () => void {
  opener = next
  return () => {
    if (opener === next) opener = undefined
  }
}

/** Returns true when the link was claimed by the Browser panel. */
export function tryOpenBrowserLink(url: string, event?: { metaKey?: boolean; ctrlKey?: boolean }): boolean {
  if (opener === undefined) return false
  if (event?.metaKey || event?.ctrlKey) return false
  if (!/^https?:\/\//i.test(url)) return false
  opener(url)
  return true
}
