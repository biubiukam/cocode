import { describe, expect, it } from 'vitest'
import {
  clearViewport,
  enterScreen,
  parseScreenMode,
  supportsAlternateScreen,
} from '../../src/present/clear-screen.ts'

function output(isTTY = true): { isTTY: boolean; writes: string[]; write(value: string): void } {
  return {
    isTTY,
    writes: [],
    write(value) {
      this.writes.push(value)
    },
  }
}

describe('screen mode', () => {
  it('defaults unknown values to inline', () => {
    expect(parseScreenMode(undefined)).toBe('inline')
    expect(parseScreenMode('alternate')).toBe('alternate')
    expect(parseScreenMode(' INLINE ')).toBe('inline')
  })

  it('uses the alternate buffer on terminals that support it', () => {
    const target = output()
    const leave = enterScreen('alternate', target, 'darwin', {})
    expect(target.writes).toEqual(['\x1b[?1049h\x1b[H'])
    leave()
    expect(target.writes).toEqual(['\x1b[?1049h\x1b[H', '\x1b[?1049l'])
    leave()
    expect(target.writes).toHaveLength(2)
  })

  it('falls back to inline on legacy Windows terminals', () => {
    const target = output()
    expect(supportsAlternateScreen('win32', {})).toBe(false)
    const leave = enterScreen('alternate', target, 'win32', {})
    leave()
    expect(target.writes).toEqual(['\x1b[2J\x1b[H'])
  })

  it('uses inline mode inside a terminal multiplexer', () => {
    const target = output()
    const leave = enterScreen('alternate', target, 'linux', { TMUX: '1' })
    leave()
    expect(target.writes).toEqual(['\x1b[2J\x1b[H'])
  })

  it('does not write control sequences when output is not a TTY', () => {
    const target = output(false)
    const leave = enterScreen('alternate', target, 'darwin', {})
    clearViewport(target)
    leave()
    expect(target.writes).toEqual([])
  })
})
