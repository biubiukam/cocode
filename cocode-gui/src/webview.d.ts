/**
 * `<webview>` is an Electron built-in element with no React JSX typing. Only the
 * attributes the Browser panel actually sets are declared, so an unsupported one
 * fails to compile rather than being silently ignored at runtime.
 */

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        allowpopups?: string
        partition?: string
        useragent?: string
      }
    }
  }
}
