/**
 * Shared product constants for auth and cloud routing.
 */

export const DEFAULT_ORIGIN = 'https://cocode.agency'
export const DEFAULT_PROVIDER = 'deepseek-official'
export const DEFAULT_MODEL = 'deepseek-v4-flash'
export const CLOUD_PROVIDER = 'cocode-cloud'
export const CLOUD_KEY_REF = 'COCODE_CLOUD_API_KEY'
export const DEEPSEEK_KEY_REF = 'DEEPSEEK_API_KEY'
export const KEY_NAME = 'Cocode TUI'

export const DEVICE_SCOPES = [
  'profile:read',
  'organizations:read',
  'account:read',
  'models:read',
  'inference:write',
] as const

export type AuthMode = 'byok' | 'cocode'

export type MeProfile = {
  displayName: string
  email?: string
}

export type CloudModel = { id: string; name: string }

export type CloudProviderProfile = {
  displayName: string
  api: 'openai-responses'
  baseURL: string
  apiKeyEnv: typeof CLOUD_KEY_REF
  models: CloudModel[]
}

export type AccountRecord = {
  origin: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  personalKeyId?: string
  personalKeyName?: string
}

export type ResolvedAuth = {
  mode: AuthMode
  provider: string
  model: string
  cwd: string
  origin: string
  accountHome: string
  dshHome: string
  cloudProvider?: CloudProviderProfile
  env: NodeJS.ProcessEnv
}

export type AuthSnapshot = {
  phase: 'gate' | 'byok' | 'device' | 'busy' | 'ready' | 'failed'
  mode?: AuthMode
  profile?: MeProfile
  device?: {
    userCode: string
    verificationUri: string
    verificationUriComplete: string
    expiresIn: number
  }
  error?: string
  envLocked: boolean
  channels?: { byok: boolean; cocode: boolean }
}

export type AuthAction =
  | { type: 'chooseByok' }
  | { type: 'submitByok'; provider: string; key: string }
  | { type: 'chooseCocode' }
  | { type: 'cancel' }
  | { type: 'logout' }
