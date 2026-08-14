import { describe, expect, it } from 'vitest'
import type { TuiAction } from '../../src/runtime/app.ts'
import { createBuiltinCommands, parseSlash } from '../../src/runtime/commands.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'

describe('commands', () => {
  it('parses slash name and args', () => {
    expect(parseSlash('/status')).toEqual({ name: 'status', args: '' })
    expect(parseSlash('/theme dark')).toEqual({ name: 'theme', args: 'dark' })
    expect(parseSlash('hello')).toBeNull()
  })

  it('lists only available local commands', () => {
    const names = createBuiltinCommands()
      .list(P0_CAPABILITIES)
      .map((command) => command.name)
    expect(names).toEqual([
      'help',
      'exit',
      'clear',
      'status',
      'doctor',
      'theme',
      'export',
      'init',
      'new',
      'use',
      'login',
      'logout',
    ])
  })

  it('unknown names are absent', () => {
    expect(createBuiltinCommands().find('resume', P0_CAPABILITIES)).toBeUndefined()
  })

  it('/exit dispatches quit', () => {
    const actions: TuiAction[] = []
    const command = createBuiltinCommands().find('exit', P0_CAPABILITIES)
    command?.run(
      {
        dispatch: (action) => actions.push(action),
        newSession: () => {},
        clearTranscript: () => {},
        showStatus: () => {},
        notice: () => {},
        logout: async () => {},
      },
      '',
    )
    expect(actions).toEqual([{ type: 'quit' }])
  })

  it('/use byok delegates to useAuth', () => {
    const used: string[] = []
    const command = createBuiltinCommands().find('use', P0_CAPABILITIES)
    command?.run(commandCtx({ useAuth: (target) => used.push(target) }), 'byok')
    expect(used).toEqual(['byok'])
  })

  it('/use without a channel explains the usage', () => {
    const notices: string[] = []
    const command = createBuiltinCommands().find('use', P0_CAPABILITIES)
    command?.run(commandCtx({ notice: (_tone, message) => notices.push(message) }), '')
    expect(notices.join('\n')).toMatch(/\/use byok/)
    expect(notices.join('\n')).not.toMatch(/sk-|ck_/)
  })

  it('/login delegates to useAuth', () => {
    const used: string[] = []
    const command = createBuiltinCommands().find('login', P0_CAPABILITIES)
    command?.run(commandCtx({ useAuth: (target) => used.push(target) }), '')
    expect(used).toEqual(['login'])
  })
})

function commandCtx(
  overrides: Partial<{
    dispatch: (action: TuiAction) => void
    notice: (tone: 'info' | 'error', message: string) => void
    useAuth: (target: 'byok' | 'cocode' | 'login') => void
  }> = {},
) {
  return {
    dispatch: overrides.dispatch ?? (() => {}),
    newSession: () => {},
    clearTranscript: () => {},
    showStatus: () => {},
    notice: overrides.notice ?? (() => {}),
    logout: async () => {},
    useAuth: overrides.useAuth,
  }
}
