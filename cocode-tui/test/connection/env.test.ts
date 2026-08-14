import { describe, expect, it } from 'vitest'
import { parseInitFromEnv, parseLaunchFromEnv } from '../../packages/connection/src/env.ts'

describe('parseLaunchFromEnv', () => {
  it('rejects missing args', () => {
    const result = parseLaunchFromEnv({ COCODE_HARNESS_CMD: 'node' })
    expect(result).toEqual({
      code: 'CONFIG_HARNESS_ARGS_REQUIRED',
    })
  })

  it('splits comma-separated args', () => {
    const result = parseLaunchFromEnv({
      COCODE_HARNESS_CMD: 'node',
      COCODE_HARNESS_ARGS: '--import,tsx/esm,./bin.ts',
    })
    expect(result).toEqual({
      command: 'node',
      args: ['--import', 'tsx/esm', './bin.ts'],
      cwd: undefined,
    })
  })
})

describe('parseInitFromEnv', () => {
  it('defaults provider and model', () => {
    const result = parseInitFromEnv({ COCODE_HARNESS_CWD: '/work' })
    expect(result).toMatchObject({
      cwd: '/work',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
  })
})
