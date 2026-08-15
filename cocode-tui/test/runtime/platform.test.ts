import { describe, expect, it } from 'vitest'
import {
  clipboardCommandCandidates,
  defaultEditorCommand,
  detectMultiplexer,
  detectTerminalEnvironment,
  externalOpenCommandForPlatform,
  externalOpenCommandCandidates,
  isWslEnvironment,
  pathForPlatform,
} from '../../src/runtime/platform.ts'

describe('platform helpers', () => {
  it('selects the requested path semantics for simulated platforms', () => {
    expect(pathForPlatform('win32').resolve('C:\\workspace', '..', 'src')).toBe('C:\\src')
    expect(pathForPlatform('linux').resolve('/workspace', '..', 'src')).toBe('/src')
  })

  it('detects WSL and multiplexer environments without relying on the host', () => {
    expect(isWslEnvironment({ WSL_DISTRO_NAME: 'Ubuntu' })).toBe(true)
    expect(detectMultiplexer({ TMUX: '/tmp/tmux-1000/default,1,0' })).toBe('tmux')
    expect(detectMultiplexer({ STY: '1234.pts-0.host' })).toBe('screen')
    expect(detectMultiplexer({ TERM: 'screen-256color' })).toBe('screen')
  })

  it('disables fragile terminal surfaces inside multiplexers', () => {
    const environment = detectTerminalEnvironment({
      platform: 'linux',
      env: { TMUX: '1', DISPLAY: ':0' },
      stdinIsTTY: true,
      stdoutIsTTY: true,
      stdoutColumns: 100,
      stdoutRows: 30,
    })
    expect(environment).toMatchObject({
      isMultiplexer: true,
      supportsInput: true,
      supportsOutput: true,
      supportsAlternateScreen: false,
      supportsNotifications: false,
      supportsMouse: false,
      supportsResize: true,
    })
  })

  it('chooses clipboard commands based on Linux display protocol', () => {
    expect(clipboardCommandCandidates('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toEqual([
      { command: 'wl-copy', args: [] },
    ])
    expect(clipboardCommandCandidates('linux', { DISPLAY: ':0' })).toEqual([
      { command: 'xclip', args: ['-selection', 'clipboard'] },
      { command: 'xsel', args: ['--clipboard', '--input'] },
    ])
    expect(clipboardCommandCandidates('linux', { WSL_DISTRO_NAME: 'Ubuntu' })).toContainEqual({
      command: 'clip.exe',
      args: [],
    })
  })

  it('uses non-shell URL openers and a Windows editor fallback', () => {
    const url = 'https://example.test/a?x=1&y=2'
    expect(externalOpenCommandForPlatform(url, 'win32')).toEqual({
      command: 'explorer.exe',
      args: [url],
    })
    expect(externalOpenCommandForPlatform(url, 'linux', { WSL_DISTRO_NAME: 'Ubuntu' })).toEqual({
      command: 'explorer.exe',
      args: [url],
    })
    expect(externalOpenCommandCandidates(url, 'linux', { WSL_DISTRO_NAME: 'Ubuntu' })).toEqual([
      { command: 'explorer.exe', args: [url] },
      { command: 'xdg-open', args: [url] },
    ])
    expect(defaultEditorCommand('win32')).toEqual(['notepad.exe'])
    expect(defaultEditorCommand('darwin')).toBeUndefined()
  })
})
