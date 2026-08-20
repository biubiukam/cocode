import { randomUUID } from 'node:crypto'
import { arch, platform } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readYamlUnknown, writeYamlFile } from './io.ts'

const manifest = createRequire(import.meta.url)('../../../package.json') as { version?: string }

export type CocodeClientIdentity = {
  product: 'cocode'
  surface: 'tui'
  version: string
  build: string
  os: 'darwin' | 'linux' | 'windows'
  arch: 'arm64' | 'x64'
  installation_id: string
}

export async function tuiClientIdentity(
  accountHome: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CocodeClientIdentity> {
  const path = join(accountHome, 'installation.yaml')
  const loaded = await readYamlUnknown(path, { secret: true })
  const record = isRecord(loaded.value) ? loaded.value : {}
  const stored = typeof record.installation_id === 'string' ? record.installation_id : undefined
  const installationId = stored !== undefined && /^[0-9a-f-]{36}$/i.test(stored)
    ? stored
    : randomUUID()
  if (stored !== installationId) {
    try {
      await writeYamlFile(path, { installation_id: installationId }, 0o600)
    } catch {
      // Client metadata is best-effort; authentication must remain usable on
      // read-only or unusual account homes. The Agency will classify the
      // resulting request as unknown if the identity cannot be persisted.
    }
  }
  const currentPlatform = platform()
  return {
    product: 'cocode',
    surface: 'tui',
    version: manifest.version?.trim() || '0.0.0-dev',
    build: env.COCODE_BUILD_ID?.trim().slice(0, 64) || 'dev',
    os: currentPlatform === 'win32' ? 'windows' : currentPlatform === 'linux' ? 'linux' : 'darwin',
    arch: arch() === 'arm64' ? 'arm64' : 'x64',
    installation_id: installationId,
  }
}

export function harnessClientIdentity(identity: CocodeClientIdentity) {
  return {
    product: identity.product,
    surface: identity.surface,
    version: identity.version,
    build: identity.build,
    os: identity.os,
    arch: identity.arch,
    installationId: identity.installation_id,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
