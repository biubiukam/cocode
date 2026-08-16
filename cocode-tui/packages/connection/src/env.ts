/**
 * Launch spec from process.env. No hardcoded harness paths.
 */

import type { TuiInitialize, TuiLaunch } from './types.ts'

export type EnvError = never

export function parseLaunchFromEnv(env: NodeJS.ProcessEnv = process.env): TuiLaunch {
  const cwd = env.COCODE_CWD?.trim() || env.DSH_CWD?.trim() || process.cwd()
  return { cwd, env }
}

export function parseInitFromEnv(env: NodeJS.ProcessEnv = process.env): TuiInitialize {
  return {
    cwd: env.COCODE_CWD?.trim() || env.DSH_CWD?.trim() || process.cwd(),
    provider: env.COCODE_PROVIDER?.trim() || 'deepseek-official',
    model: env.COCODE_MODEL?.trim() || 'deepseek-v4-flash',
  }
}
