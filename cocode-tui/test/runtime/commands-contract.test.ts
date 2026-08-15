import { describe, expect, it, vi } from 'vitest'
import type { TuiAction } from '../../src/runtime/app.ts'
import { createBuiltinCommands, filterCommands, parseSlash } from '../../src/runtime/commands.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'

describe('builtin command contract', () => {
  it('keeps the user-facing command inventory stable', () => {
    expect(createBuiltinCommands().list(P0_CAPABILITIES).map((command) => command.name)).toEqual([
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
      'queue',
    ])
  })

  it('gates every runtime-backed command on its capability', () => {
    const registry = createBuiltinCommands()
    const all = {
      ...P0_CAPABILITIES,
      sessionList: 'rpc' as const,
      open: true,
      skills: true,
      permissionMode: true,
      planMode: true,
      fork: true,
    }
    expect(registry.find('resume', all)?.name).toBe('resume')
    expect(registry.find('sessions', all)?.name).toBe('sessions')
    expect(registry.find('skills', all)?.name).toBe('skills')
    expect(registry.find('permissions', all)?.name).toBe('permissions')
    expect(registry.find('plan', all)?.name).toBe('plan')
    expect(registry.find('fork', all)?.name).toBe('fork')
    expect(registry.find('clone', all)?.name).toBe('clone')

    expect(registry.find('resume', { ...all, open: false })).toBeUndefined()
    expect(registry.find('sessions', { ...all, sessionList: 'jsonl' })).toBeUndefined()
    expect(registry.find('skills', { ...all, skills: false })).toBeUndefined()
    expect(registry.find('permissions', { ...all, permissionMode: false })).toBeUndefined()
    expect(registry.find('plan', { ...all, planMode: false })).toBeUndefined()
    expect(registry.find('fork', { ...all, fork: false })).toBeUndefined()
  })

  it('filters slash menu input without matching ordinary text', () => {
    const commands = createBuiltinCommands().list(P0_CAPABILITIES)
    expect(filterCommands(commands, '/re').map((command) => command.name)).toEqual(['review'])
    expect(filterCommands(commands, '/')).not.toHaveLength(0)
    expect(filterCommands(commands, 'review')).toEqual([])
    expect(parseSlash('/model deepseek-v4')).toEqual({ name: 'model', args: 'deepseek-v4' })
  })

  it('dispatches every P0 local command to a concrete callback', () => {
    const actions: TuiAction[] = []
    const calls = new Set<string>()
    const ctx = {
      dispatch: (action: TuiAction) => actions.push(action),
      newSession: () => calls.add('newSession'),
      clearTranscript: () => calls.add('clearTranscript'),
      showStatus: () => calls.add('showStatus'),
      showDoctor: () => calls.add('showDoctor'),
      setTheme: () => calls.add('setTheme'),
      setLocale: () => calls.add('setLocale'),
      setModel: () => calls.add('setModel'),
      exportTranscript: async () => calls.add('exportTranscript'),
      copyLatestAssistant: () => calls.add('copyLatestAssistant'),
      review: () => calls.add('review'),
      toggleFocus: () => calls.add('toggleFocus'),
      initWorkspace: async () => calls.add('initWorkspace'),
      useAuth: () => calls.add('useAuth'),
      logout: async () => calls.add('logout'),
      showForkPicker: () => calls.add('showForkPicker'),
      cloneSession: async () => calls.add('cloneSession'),
      showQueuePicker: () => calls.add('showQueuePicker'),
      notice: vi.fn(),
    }

    for (const command of createBuiltinCommands().list(P0_CAPABILITIES)) {
      command.run(ctx, command.name === 'theme' ? 'dark' : command.name === 'lang' ? 'en' : '')
    }

    expect(actions).toEqual([{ type: 'toggleHelp' }, { type: 'quit' }, { type: 'compact' }])
    expect(calls).toEqual(
      new Set([
        'newSession',
        'clearTranscript',
        'showStatus',
        'showDoctor',
        'setTheme',
        'setLocale',
        'setModel',
        'exportTranscript',
        'copyLatestAssistant',
        'review',
        'toggleFocus',
        'initWorkspace',
        'useAuth',
        'logout',
        'showForkPicker',
        'cloneSession',
        'showQueuePicker',
      ]),
    )
  })
})
