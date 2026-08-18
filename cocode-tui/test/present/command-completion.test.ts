import { describe, expect, it } from 'vitest'
import { commandArgumentCompletions } from '../../src/present/command-completion.ts'
import { createBuiltinCommands } from '../../src/runtime/commands.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'

describe('command argument completion', () => {
  it('works for built-in commands through the same metadata path', () => {
    const builtins = createBuiltinCommands().list(P0_CAPABILITIES)
    expect(commandArgumentCompletions(builtins, '/theme d')?.items).toEqual([
      { label: 'dark', insert: '/theme dark' },
    ])
    expect(commandArgumentCompletions(builtins, '/use c')?.items).toEqual([
      { label: 'cocode', insert: '/use cocode' },
    ])
  })
})
