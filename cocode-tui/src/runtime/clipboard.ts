import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { ConversationNode } from './nodes/types.ts'

export type ClipboardCommand = {
  command: string
  args: readonly string[]
}

export type ClipboardResult =
  | { ok: true; command: string }
  | { ok: false; reason: 'unsupported' | 'unavailable' }

export type ClipboardSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: ['pipe', 'ignore', 'ignore'] },
) => ChildProcessWithoutNullStreams

export function clipboardCommands(
  platform: NodeJS.Platform = process.platform,
): ClipboardCommand[] {
  if (platform === 'darwin') return [{ command: 'pbcopy', args: [] }]
  if (platform === 'win32') return [{ command: 'clip.exe', args: [] }]
  if (platform === 'linux') {
    return [
      { command: 'wl-copy', args: [] },
      { command: 'xclip', args: ['-selection', 'clipboard'] },
      { command: 'xsel', args: ['--clipboard', '--input'] },
    ]
  }
  return []
}

export async function copyToClipboard(
  value: string,
  options: { platform?: NodeJS.Platform; spawn?: ClipboardSpawn } = {},
): Promise<ClipboardResult> {
  const commands = clipboardCommands(options.platform)
  if (commands.length === 0) return { ok: false, reason: 'unsupported' }
  const spawnCommand = options.spawn ?? (spawn as unknown as ClipboardSpawn)
  for (const candidate of commands) {
    if (await runClipboardCommand(candidate, value, spawnCommand)) {
      return { ok: true, command: candidate.command }
    }
  }
  return { ok: false, reason: 'unavailable' }
}

async function runClipboardCommand(
  candidate: ClipboardCommand,
  value: string,
  spawnCommand: ClipboardSpawn,
): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnCommand(candidate.command, candidate.args, {
        stdio: ['pipe', 'ignore', 'ignore'],
      })
    } catch {
      resolve(false)
      return
    }
    let settled = false
    const timeout = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // The process may have already exited or be a minimal test double.
      }
      finish(false)
    }, 1500)
    const finish = (success: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(success)
    }
    child.once('error', () => finish(false))
    child.once('close', (code) => finish(code === 0))
    try {
      child.stdin.end(value)
    } catch {
      finish(false)
    }
  })
}

export function readableNodeText(node: ConversationNode): string {
  switch (node.kind) {
    case 'user':
      return node.text
    case 'assistant':
      return node.text !== '' ? node.text : node.reasoning
    case 'tool':
      return node.result !== undefined && node.result !== ''
        ? node.result
        : node.args !== ''
        ? node.args
        : node.name
    case 'notice':
      return ''
  }
}
