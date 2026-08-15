/**
 * Open a URL in the system browser. Failure is non-fatal.
 */

import { spawn } from 'node:child_process'
import { externalOpenCommandCandidates, externalOpenCommandForPlatform } from '../platform.ts'

export function openExternal(
  url: string,
  options: {
    platform?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    onFailure?: () => void
  } = {},
): void {
  try {
    const candidates = externalOpenCommandCandidates(url, options.platform, options.env)
    launchCandidate(candidates, 0, options.onFailure)
  } catch {
    options.onFailure?.()
  }
}

function launchCandidate(
  candidates: readonly { command: string; args: readonly string[] }[],
  index = 0,
  onFailure?: () => void,
): void {
  const candidate = candidates[index]
  if (candidate === undefined) {
    onFailure?.()
    return
  }
  try {
    let advanced = false
    const tryNext = (): void => {
      if (advanced) return
      advanced = true
      launchCandidate(candidates, index + 1, onFailure)
    }
    const child = spawn(candidate.command, [...candidate.args], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    })
    child.once('error', tryNext)
    child.once('exit', (code) => {
      if (code !== 0) tryNext()
    })
    child.unref()
  } catch {
    launchCandidate(candidates, index + 1, onFailure)
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
