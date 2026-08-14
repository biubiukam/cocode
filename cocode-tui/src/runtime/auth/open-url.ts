/**
 * Open a URL in the system browser. Failure is non-fatal.
 */

import { spawn } from 'node:child_process'

export function openExternal(url: string): void {
  try {
    const target = externalOpenCommand(url)
    const child = spawn(target.command, target.args, { stdio: 'ignore', detached: true })
    child.once('error', () => undefined)
    child.unref()
  } catch {
    // The gate still shows the URL.
  }
}

export function externalOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] }
  if (platform === 'win32') return { command: 'explorer.exe', args: [url] }
  return { command: 'xdg-open', args: [url] }
}
