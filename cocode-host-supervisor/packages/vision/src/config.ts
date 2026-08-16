import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'
import type { VisionConfig, VisionEndpointConfig, VisionProvider } from './index.ts'

const CONFIG_FILE_NAME = 'vision.yaml'

/** Read the user-owned visual provider configuration without reading secrets. */
export function loadVisionConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig | undefined {
  const path = configPath(env)
  let metadata
  try {
    metadata = lstatSync(path)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
  if (metadata.isSymbolicLink()) throw new Error(`cocode vision config must not be a symbolic link: ${path}`)
  if (!metadata.isFile()) throw new Error(`cocode vision config must be a file: ${path}`)

  let value: unknown
  try {
    value = parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`could not parse cocode vision config: ${path}`)
  }
  return parseVisionConfig(value, path)
}

/** Persist non-secret visual settings with an atomic replace. */
export function saveVisionConfig(config: VisionConfig, env: NodeJS.ProcessEnv = process.env): void {
  const path = configPath(env)
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  let metadata
  try {
    metadata = lstatSync(path)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  if (metadata?.isSymbolicLink()) throw new Error(`cocode vision config must not be a symbolic link: ${path}`)
  if (metadata !== undefined && !metadata.isFile()) throw new Error(`cocode vision config must be a file: ${path}`)

  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(temporaryPath, stringify(config), { encoding: 'utf8', mode: 0o600 })
    chmodSync(temporaryPath, 0o600)
    renameSync(temporaryPath, path)
  } catch (error) {
    try {
      if (lstatSync(temporaryPath).isFile()) unlinkSync(temporaryPath)
    } catch {
      // The temporary file may not have been created or may already be renamed.
    }
    throw error
  }
}

/** Merge persisted settings first, then explicit runtime configuration. */
export function mergeVisionConfig(
  stored: VisionConfig | undefined,
  override: VisionConfig,
): VisionConfig {
  const user = mergeEndpointConfig(stored?.user, override.user)
  const cocode = mergeEndpointConfig(stored?.cocode, override.cocode)
  return {
    ...definedFields(stored),
    ...definedFields(override),
    ...(user === undefined ? {} : { user }),
    ...(cocode === undefined ? {} : { cocode }),
  }
}

export function visionConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return configPath(env)
}

function configPath(env: NodeJS.ProcessEnv): string {
  const configured = nonempty(env.COCODE_VISION_CONFIG)
  if (configured !== undefined) return isAbsolute(configured) ? configured : resolve(configured)
  const home = nonempty(env.COCODE_HOME)
  return join(home === undefined ? join(homedir(), '.cocode') : resolve(home), CONFIG_FILE_NAME)
}

function parseVisionConfig(value: unknown, path: string): VisionConfig {
  const root = asRecord(value)
  if (root === undefined) throw new Error(`cocode vision config must be a mapping: ${path}`)
  const provider = root.provider
  if (provider !== undefined && provider !== 'user' && provider !== 'cocode') {
    throw new Error(`cocode vision config has an invalid provider: ${path}`)
  }
  const timeoutMs = root.timeoutMs
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`cocode vision config has an invalid timeoutMs: ${path}`)
  }
  return {
    ...(provider === undefined ? {} : { provider: provider as VisionProvider }),
    ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
    ...(typeof root.autoRead === 'boolean' ? { autoRead: root.autoRead } : {}),
    ...(typeof root.fallbackToNative === 'boolean' ? { fallbackToNative: root.fallbackToNative } : {}),
    ...(root.user === undefined ? {} : { user: parseEndpointConfig(root.user, path, 'user') }),
    ...(root.cocode === undefined ? {} : { cocode: parseEndpointConfig(root.cocode, path, 'cocode') }),
  }
}

function parseEndpointConfig(value: unknown, path: string, name: string): VisionEndpointConfig {
  const root = asRecord(value)
  if (root === undefined) throw new Error(`cocode vision config ${name} must be a mapping: ${path}`)
  return {
    ...(stringField(root.endpoint) ? { endpoint: root.endpoint as string } : {}),
    ...(stringField(root.model) ? { model: root.model as string } : {}),
    ...(stringField(root.credentialRef) ? { credentialRef: root.credentialRef as string } : {}),
  }
}

function mergeEndpointConfig(
  stored: VisionEndpointConfig | undefined,
  override: VisionEndpointConfig | undefined,
): VisionEndpointConfig | undefined {
  if (stored === undefined && override === undefined) return undefined
  return {
    ...(stored ?? {}),
    ...definedFields(override),
  }
}

function definedFields<T extends object>(value: T | undefined): Partial<T> {
  if (value === undefined) return {}
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringField(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
