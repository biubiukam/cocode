/**
 * Open a URL in the system browser. Failure is non-fatal.
 */

import { spawn } from 'node:child_process'
import { externalOpenCommandForPlatform } from '../platform.ts'

export function openExternal(
  url: string,
  options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {},
): void {
  try {
    const target = externalOpenCommand(url, options.platform, options.env)
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
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  const target = externalOpenCommandForPlatform(url, platform, env)
  return { command: target.command, args: [...target.args] }
}
