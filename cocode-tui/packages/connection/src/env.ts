/**
 * Launch spec from process.env. No hardcoded harness paths.
 */

import type { TuiInitialize, TuiLaunch } from './types.ts'

export type EnvError = { code: 'CONFIG_HARNESS_ARGS_REQUIRED' }

export function parseLaunchFromEnv(env: NodeJS.ProcessEnv = process.env): TuiLaunch | EnvError {
  const command = env.COCODE_HARNESS_CMD?.trim() || 'node'
  const raw = env.COCODE_HARNESS_ARGS?.trim() ?? ''
  const args =
    raw === ''
      ? []
      : raw
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '')
  if (args.length === 0) {
    return {
      code: 'CONFIG_HARNESS_ARGS_REQUIRED',
    }
  }
  const cwd = env.COCODE_HARNESS_CWD?.trim()
  return { command, args, cwd: cwd === '' ? undefined : cwd }
}

export function parseInitFromEnv(env: NodeJS.ProcessEnv = process.env): TuiInitialize {
  return {
    cwd: env.COCODE_HARNESS_CWD?.trim() || process.cwd(),
    provider: env.COCODE_PROVIDER?.trim() || 'deepseek-official',
    model: env.COCODE_MODEL?.trim() || 'deepseek-v4-flash',
  }
}
