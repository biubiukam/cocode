import { describe, expect, it } from 'vitest'
import { commandArgumentCompletions } from '../../src/present/command-completion.ts'
import { createBuiltinCommands } from '../../src/runtime/commands.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'

const commands = [
  {
    name: 'vision',
    input: {
      hint: 'status | provider <cocode|user> | model <id> | endpoint <url> | credential <ref> | enable|disable',
    },
  },
]

describe('command argument completion', () => {
  it('suggests static arguments after a command name', () => {
    expect(commandArgumentCompletions(commands, '/vision sta')).toMatchObject({
      commandName: 'vision',
      query: 'sta',
      items: [{ label: 'status', insert: '/vision status' }],
    })
  })

  it('suggests values from an argument placeholder', () => {
    expect(commandArgumentCompletions(commands, '/vision provider c')).toMatchObject({
      query: 'c',
      items: [{ label: 'cocode', insert: '/vision provider cocode' }],
    })
    expect(commandArgumentCompletions(commands, '/vision provider ')).toMatchObject({
      query: '',
      items: [
        { label: 'cocode', insert: '/vision provider cocode' },
        { label: 'user', insert: '/vision provider user' },
      ],
    })
  })

  it('does not invent completions for free-form values', () => {
    expect(commandArgumentCompletions(commands, '/vision model gpt')).toBeUndefined()
    expect(commandArgumentCompletions(commands, '/vision model ')).toBeUndefined()
    expect(commandArgumentCompletions(commands, '/vision endpoint ')).toBeUndefined()
    expect(commandArgumentCompletions(commands, '/vision credential ')).toBeUndefined()
    expect(commandArgumentCompletions(commands, '/vision status ')).toBeUndefined()
    expect(commandArgumentCompletions(commands, '/vision')).toBeUndefined()
  })

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
