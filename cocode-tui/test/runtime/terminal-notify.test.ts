import { describe, expect, it } from 'vitest'
import {
  buildTerminalNotification,
  notifyTerminal,
  parseTerminalNotifyMode,
} from '../../src/runtime/terminal-notify.ts'

describe('terminal notifications', () => {
  it('defaults to the OSC 9 compatible mode', () => {
    expect(parseTerminalNotifyMode(undefined)).toBe('auto')
    expect(buildTerminalNotification({ mode: 'auto', title: 'Cocode', body: 'done' })).toBe(
      '\u001b]9;done\u0007',
    )
  })

  it('supports OSC 777 and sanitizes control characters', () => {
    expect(buildTerminalNotification({ mode: 'osc777', title: 'Co;code', body: 'done\nnow' })).toBe(
      '\u001b]777;notify;Co code;done now\u0007',
    )
  })

  it('degrades when notifications are disabled or writing fails', () => {
    const values: string[] = []
    expect(
      notifyTerminal({
        mode: 'off',
        title: 'Cocode',
        body: 'done',
        write: (value) => values.push(value),
      }),
    ).toBe(false)
    expect(values).toEqual([])
    expect(
      notifyTerminal({
        mode: 'auto',
        title: 'Cocode',
        body: 'done',
        write: () => {
          throw new Error('no tty')
        },
      }),
    ).toBe(false)
  })
})
