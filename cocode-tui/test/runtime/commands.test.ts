import { describe, expect, it } from 'vitest'
import type { TuiAction } from '../../src/runtime/app.ts'
import { createBuiltinCommands, helpText, parseSlash } from '../../src/runtime/commands.ts'
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
      'lang',
      'model',
      'export',
      'copy',
      'review',
      'focus',
      'init',
      'new',
      'compact',
      'use',
      'login',
      'logout',
      'fork',
      'clone',
    ])
  })

  it('unknown names are absent', () => {
    expect(createBuiltinCommands().find('resume', P0_CAPABILITIES)).toBeUndefined()
  })

  it('hides resume when the runtime cannot open persisted sessions', () => {
    const registry = createBuiltinCommands()
    expect(
      registry.find('resume', { ...P0_CAPABILITIES, sessionList: 'jsonl', open: false }),
    ).toBeUndefined()
    expect(
      registry.find('resume', { ...P0_CAPABILITIES, sessionList: 'jsonl', open: true }),
    ).toBeDefined()
  })

  it('localizes the focus command summary in Chinese help', () => {
    expect(helpText(P0_CAPABILITIES, createBuiltinCommands(), 'zh')).toContain(
      '/focus  切换最近一轮聚焦视图',
    )
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

  it('/lang delegates the requested locale', () => {
    const locales: string[] = []
    const command = createBuiltinCommands().find('lang', P0_CAPABILITIES)
    command?.run(commandCtx({ setLocale: (value) => locales.push(value) }), 'zh')
    expect(locales).toEqual(['zh'])
  })

  it('/model delegates the requested model', () => {
    const models: string[] = []
    const command = createBuiltinCommands().find('model', P0_CAPABILITIES)
    command?.run(commandCtx({ setModel: (value) => models.push(value) }), 'm2')
    expect(models).toEqual(['m2'])
  })

  it('/compact sends a prompt-path request', () => {
    const actions: TuiAction[] = []
    const command = createBuiltinCommands().find('compact', P0_CAPABILITIES)
    command?.run(commandCtx({ dispatch: (action) => actions.push(action) }), '')
    expect(actions).toEqual([{ type: 'compact' }])
  })

  it('/copy delegates to the latest assistant callback', () => {
    let called = false
    const command = createBuiltinCommands().find('copy', P0_CAPABILITIES)
    command?.run(commandCtx({ copyLatestAssistant: () => (called = true) }), '')
    expect(called).toBe(true)
  })

  it('/focus delegates to the focus callback', () => {
    let called = false
    const command = createBuiltinCommands().find('focus', P0_CAPABILITIES)
    command?.run(commandCtx({ toggleFocus: () => (called = true) }), '')
    expect(called).toBe(true)
  })
})

function commandCtx(
  overrides: Partial<{
    dispatch: (action: TuiAction) => void
    notice: (tone: 'info' | 'error', message: string) => void
    useAuth: (target: 'byok' | 'cocode' | 'login') => void
    setLocale: (value: string) => void
    setModel: (value: string) => void
    copyLatestAssistant: () => void
    toggleFocus: () => void
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
    setLocale: overrides.setLocale,
    setModel: overrides.setModel,
    copyLatestAssistant: overrides.copyLatestAssistant,
    toggleFocus: overrides.toggleFocus,
  }
}
