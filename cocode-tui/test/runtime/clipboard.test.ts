import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  clipboardCommands,
  copyToClipboard,
  readableNodeText,
} from '../../src/runtime/clipboard.ts'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'

describe('clipboard', () => {
  it('selects native clipboard commands per platform', () => {
    expect(clipboardCommands('darwin')).toEqual([{ command: 'pbcopy', args: [] }])
    expect(clipboardCommands('win32')).toEqual([{ command: 'clip.exe', args: [] }])
    expect(clipboardCommands('linux').map(({ command }) => command)).toEqual([
      'wl-copy',
      'xclip',
      'xsel',
    ])
  })

  it('falls back to the next Linux command after a failure', async () => {
    const calls: { command: string; value: string }[] = []
    const result = await copyToClipboard('answer', {
      platform: 'linux',
      spawn: (command, _args) => {
        const child = new EventEmitter() as ChildProcessWithoutNullStreams
        const stdin = new PassThrough()
        const output: Buffer[] = []
        stdin.on('data', (chunk: Buffer) => output.push(chunk))
        stdin.on('finish', () => {
          calls.push({ command, value: Buffer.concat(output).toString() })
          queueMicrotask(() => child.emit('close', command === 'wl-copy' ? 1 : 0))
        })
        Object.assign(child, { stdin, stdout: new PassThrough(), stderr: new PassThrough() })
        return child
      },
    })
    expect(result).toEqual({ ok: true, command: 'xclip' })
    expect(calls).toEqual([
      { command: 'wl-copy', value: 'answer' },
      { command: 'xclip', value: 'answer' },
    ])
  })

  it('returns a non-throwing failure when no platform command exists', async () => {
    await expect(copyToClipboard('answer', { platform: 'freebsd' })).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    })
  })

  it('extracts readable text from conversation nodes', () => {
    const assistant: ConversationNode = {
      kind: 'assistant',
      id: 'a1',
      seq: 1,
      time: 1,
      turn: 1,
      step: 1,
      text: 'answer',
      reasoning: 'thinking',
      streaming: false,
    }
    expect(readableNodeText(assistant)).toBe('answer')
    expect(
      readableNodeText({
        kind: 'notice',
        id: 'n1',
        seq: 2,
        time: 2,
        tone: 'info',
        message: 'notice',
      }),
    ).toBe('')
  })
})
