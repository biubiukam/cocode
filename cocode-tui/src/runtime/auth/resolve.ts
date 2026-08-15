/**
 * Decide whether the TUI can skip AuthGate and how to spawn.
 */

import { patchCredential, readCredentials } from './credentials.ts'
import { agencyOrigin } from './origin.ts'
import { readSettings, type ProductSettings } from './settings.ts'
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
  const credentials = await readCredentials(home)
  const envProvider = nonempty(env.COCODE_PROVIDER)
  const preferred = envProvider ?? settings.provider ?? DEFAULT_PROVIDER

  const preferredReady = tryChannel(preferred, true, {
    env,
    home,
    cwd,
    origin,
    settings,
    credentials,
  })
  if (preferredReady !== undefined) return preferredReady

  if (preferred === CLOUD_PROVIDER) {
    const byok = tryChannel(DEFAULT_PROVIDER, false, {
      env,
      home,
      cwd,
      origin,
      settings,
      credentials,
    })
    if (byok !== undefined) return byok
  } else if (preferred === DEFAULT_PROVIDER) {
    const cloud = tryChannel(CLOUD_PROVIDER, false, {
      env,
      home,
      cwd,
      origin,
      settings,
      credentials,
    })
    if (cloud !== undefined) return cloud
  }

  return { status: 'gate', envLocked: envProvider !== undefined, home }
}

export function channelAvailability(
  credentials: Record<string, string>,
  settings: { hasCloudRoute: boolean },
  env: NodeJS.ProcessEnv = {},
): { byok: boolean; cocode: boolean } {
  return {
    byok:
      nonempty(env[DEEPSEEK_KEY_REF]) !== undefined ||
      nonempty(credentials[DEEPSEEK_KEY_REF]) !== undefined,
    cocode:
      (nonempty(env[CLOUD_KEY_REF]) !== undefined ||
        nonempty(credentials[CLOUD_KEY_REF]) !== undefined) &&
      settings.hasCloudRoute,
  }
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

type ChannelInput = {
  env: NodeJS.ProcessEnv
  home: string
  cwd: string
  origin: string
  settings: ProductSettings
  credentials: Record<string, string>
}

function tryChannel(
  provider: string,
  isPreferred: boolean,
  input: ChannelInput,
): { status: 'ready'; auth: ResolvedAuth } | undefined {
  const { env, home, cwd, origin, settings, credentials } = input
  const providerSettings = settings.providerCredentials[provider]
  const ref = apiKeyEnvFor(provider, providerSettings?.apiKeyEnv)
  const value = ref === undefined ? undefined : nonempty(env[ref]) ?? nonempty(credentials[ref])
  const model = channelModel(provider, isPreferred, env, settings)
  const mode: AuthMode = provider === CLOUD_PROVIDER ? 'cocode' : 'byok'

  if (provider === CLOUD_PROVIDER && value !== undefined && !settings.hasCloudRoute) {
    return undefined
  }
  if (value !== undefined && ref !== undefined) {
    return ready(mode, provider, model, cwd, origin, home, env, { [ref]: value })
  }
  if (providerSettings?.writable === false) {
    return ready(mode, provider, model, cwd, origin, home, env, {})
  }
  return undefined
}

function channelModel(
  provider: string,
  isPreferred: boolean,
  env: NodeJS.ProcessEnv,
  settings: ProductSettings,
): string {
  if (isPreferred) {
    return nonempty(env.COCODE_MODEL) ?? settings.model ?? DEFAULT_MODEL
  }
  return DEFAULT_MODEL
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
  const spawn: NodeJS.ProcessEnv = { ...env }
  delete spawn[CLOUD_KEY_REF]
  delete spawn[DEEPSEEK_KEY_REF]
  Object.assign(spawn, extra)
  spawn.DSH_HOME = home
  spawn.COCODE_PROVIDER = provider
  spawn.COCODE_MODEL = model
  return {
    status: 'ready',
    auth: {
      mode,
      provider,
      model,
      cwd,
      origin,
      home,
      env: spawn,
    },
  }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}
