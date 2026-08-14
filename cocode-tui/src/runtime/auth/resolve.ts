/**
 * Decide whether the TUI can skip AuthGate and how to spawn.
 */

import { patchCredential, readCredentials } from './credentials.ts'
import { agencyOrigin } from './origin.ts'
import { readSettings } from './settings.ts'
import {
  CLOUD_KEY_REF,
  CLOUD_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEEPSEEK_KEY_REF,
  type AuthMode,
  type ResolvedAuth,
} from './types.ts'

export type ResolveInput = {
  home: string
  env: NodeJS.ProcessEnv
  cwd?: string
}

export type ResolveResult =
  | { status: 'ready'; auth: ResolvedAuth }
  | { status: 'gate'; envLocked: boolean; home: string }

export async function resolveAuth(input: ResolveInput): Promise<ResolveResult> {
  const env = input.env
  const home = input.home
  const cwd = input.cwd?.trim() || process.cwd()
  const origin = agencyOrigin(env)
  const settings = await readSettings(home)
  const provider = nonempty(env.COCODE_PROVIDER) ?? settings.provider ?? DEFAULT_PROVIDER
  const model = nonempty(env.COCODE_MODEL) ?? settings.model ?? DEFAULT_MODEL
  const credentials = await readCredentials(home)

  const cloudEnv = nonempty(env[CLOUD_KEY_REF])
  if (cloudEnv !== undefined) {
    return ready('cocode', CLOUD_PROVIDER, model, cwd, origin, home, env, {
      [CLOUD_KEY_REF]: cloudEnv,
    })
  }

  const providerSettings = settings.providerCredentials[provider]
  const providerRef = apiKeyEnvFor(provider, providerSettings?.apiKeyEnv)
  const byokEnv = providerRef === undefined ? undefined : nonempty(env[providerRef])
  if (providerRef !== undefined && byokEnv !== undefined) {
    return ready('byok', provider, model, cwd, origin, home, env, envOverlay(providerRef, byokEnv))
  }

  const cloudFile = nonempty(credentials[CLOUD_KEY_REF])
  if (cloudFile !== undefined && settings.hasCloudRoute) {
    return ready('cocode', CLOUD_PROVIDER, model, cwd, origin, home, env, {
      [CLOUD_KEY_REF]: cloudFile,
    })
  }

  const byokFile = providerRef === undefined ? undefined : nonempty(credentials[providerRef])
  if (providerRef !== undefined && byokFile !== undefined) {
    return ready('byok', provider, model, cwd, origin, home, env, envOverlay(providerRef, byokFile))
  }

  if (providerSettings?.writable === false) {
    return ready(
      provider === CLOUD_PROVIDER ? 'cocode' : 'byok',
      provider,
      model,
      cwd,
      origin,
      home,
      env,
      {},
    )
  }

  return { status: 'gate', envLocked: false, home }
}

export function apiKeyEnvFor(provider: string, configured?: string): string | undefined {
  if (configured !== undefined && configured.trim() !== '') {
    return configured.trim()
  }
  if (provider === CLOUD_PROVIDER) return CLOUD_KEY_REF
  if (provider === DEFAULT_PROVIDER) return DEEPSEEK_KEY_REF
  return undefined
}

export async function saveByokKey(home: string, key: string): Promise<void> {
  await patchCredential(home, DEEPSEEK_KEY_REF, key)
}

function ready(
  mode: AuthMode,
  provider: string,
  model: string,
  cwd: string,
  origin: string,
  home: string,
  env: NodeJS.ProcessEnv,
  extra: NodeJS.ProcessEnv,
): { status: 'ready'; auth: ResolvedAuth } {
  return {
    status: 'ready',
    auth: {
      mode,
      provider,
      model,
      cwd,
      origin,
      home,
      env: { ...env, ...extra, DSH_HOME: home },
    },
  }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function envOverlay(ref: string, value: string): NodeJS.ProcessEnv {
  return { [ref]: value }
}
