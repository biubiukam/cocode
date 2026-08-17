import { describe, expect, it } from 'vitest'

import {
  applyScopeOptions,
  formatHostStatus,
  parseCliArgs,
  resolveGuiLaunch,
} from '../bin/cli.mjs'

describe('cocode CLI', () => {
  it('keeps TUI as the default and exposes explicit GUI/TUI commands', () => {
    expect(parseCliArgs([])).toMatchObject({ command: 'tui', commandArgs: [] })
    expect(parseCliArgs(['gui', '--workspace', '/tmp/project'])).toMatchObject({
      command: 'gui',
      commandArgs: ['--workspace', '/tmp/project'],
    })
    expect(parseCliArgs(['--tui'])).toMatchObject({ command: 'tui', commandArgs: [] })
  })

  it('parses Host controls and scope options on either side of the command', () => {
    expect(parseCliArgs(['--profile', 'web', 'host', 'status', '--json'])).toMatchObject({
      command: 'host-status',
      profile: 'web',
      json: true,
    })
    expect(parseCliArgs(['host', 'stop', '--dsh-home', '/tmp/dsh', '--force'])).toMatchObject({
      command: 'host-stop',
      dshHome: '/tmp/dsh',
      force: true,
    })
  })

  it('validates runtime channels before changing the environment', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(() => applyScopeOptions({ runtimeChannel: 'nightly' }, env)).toThrow(
      '--runtime-channel must be stable, preview, or dev.',
    )
    applyScopeOptions({ runtimeChannel: 'preview', profile: 'web' }, env)
    expect(env).toMatchObject({ COCODE_RUNTIME_CHANNEL: 'preview', DSH_PROFILE: 'web' })
  })

  it('prints script-friendly Host status and honors an explicit GUI path', () => {
    expect(JSON.parse(formatHostStatus(null, true))).toEqual({ status: 'stopped' })
    expect(resolveGuiLaunch({ COCODE_GUI_EXECUTABLE: './Cocode' }, 'linux')).toEqual({
      executable: expect.stringMatching(/Cocode$/),
      args: [],
    })
  })
})
