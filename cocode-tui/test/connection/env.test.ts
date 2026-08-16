import { describe, expect, it } from 'vitest'
import { parseInitFromEnv, parseLaunchFromEnv } from '../../packages/connection/src/env.ts'

describe('parseLaunchFromEnv', () => {
  it('does not require a subprocess command', () => {
    const result = parseLaunchFromEnv({ COCODE_CWD: '/work' })
    expect(result).toMatchObject({ cwd: '/work' })
  })

  it('preserves environment for Supervisor scope resolution', () => {
    const result = parseLaunchFromEnv({
      DSH_HOME: '/dsh',
      DSH_PROFILE: 'web',
    })
    expect(result.env?.DSH_HOME).toBe('/dsh')
    expect(result.env?.DSH_PROFILE).toBe('web')
  })
})

describe('parseInitFromEnv', () => {
  it('defaults provider and model', () => {
    const result = parseInitFromEnv({ DSH_CWD: '/work' })
    expect(result).toMatchObject({
      cwd: '/work',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
  })
})
