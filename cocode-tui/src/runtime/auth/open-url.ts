/**
 * Open a URL in the system browser. Failure is non-fatal.
 */

import { spawn } from 'node:child_process'

export function openExternal(url: string): void {
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      return
    }
    if (process.platform === 'win32') {
      spawn('explorer.exe', [url], { stdio: 'ignore', detached: true }).unref()
      return
    }
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
  } catch {
    // The gate still shows the URL.
  }
}
