import type { WhaleLogoSize } from './whale-animation.ts'

export type EmptyStateLayout = {
  logoSize: WhaleLogoSize
  showTitle: boolean
  showHint: boolean
}

export function emptyStateLayout(
  maxRows: number | undefined,
  maxColumns?: number,
): EmptyStateLayout {
  if (maxColumns !== undefined && maxColumns < 42) {
    return { logoSize: 'inline', showTitle: false, showHint: false }
  }
  if (maxColumns !== undefined && maxColumns < 56) {
    if (maxRows === undefined || maxRows >= 8) {
      return { logoSize: 'small', showTitle: true, showHint: false }
    }
    return { logoSize: 'inline', showTitle: false, showHint: false }
  }
  if (maxColumns !== undefined && maxColumns < 72) {
    if (maxRows === undefined || maxRows >= 14) {
      return { logoSize: 'medium', showTitle: true, showHint: true }
    }
    return { logoSize: 'small', showTitle: true, showHint: false }
  }
  if (maxRows === undefined || maxRows >= 17) {
    return { logoSize: 'large', showTitle: true, showHint: true }
  }
  if (maxRows >= 14) {
    return { logoSize: 'medium', showTitle: true, showHint: true }
  }
  if (maxRows >= 8) {
    return { logoSize: 'small', showTitle: true, showHint: false }
  }
  return { logoSize: 'inline', showTitle: false, showHint: false }
}
