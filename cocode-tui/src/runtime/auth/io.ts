/**
 * YAML document helpers. Secret files are written mode 0600.
 */

import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parse, stringify } from 'yaml'

export type ReadYamlOptions = {
  secret?: boolean
}

export async function readYamlUnknown(
  path: string,
  options: ReadYamlOptions = {},
): Promise<{
  missing: boolean
  value: unknown
}> {
  const metadata = await fileMetadata(path)
  if (metadata === undefined) return { missing: true, value: undefined }
  if (metadata.isSymbolicLink()) {
    throw new Error(`refusing to read symbolic link ${path}`)
  }
  if (!metadata.isFile()) throw new Error(`${path} is not a file`)
  if (options.secret === true && process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${path} must have mode 0600`)
  }
  let text: string
  try {
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      text = await handle.readFile('utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { missing: true, value: undefined }
    }
    throw error
  }
  try {
    return { missing: false, value: parse(text) }
  } catch {
    throw new Error(`could not parse ${path}`)
  }
}

export async function writeYamlFile(path: string, value: unknown, mode = 0o600): Promise<void> {
  const directory = dirname(path)
  await ensurePrivateDirectory(directory)
  const existing = await fileMetadata(path)
  if (existing?.isSymbolicLink()) {
    throw new Error(`refusing to replace symbolic link ${path}`)
  }
  if (existing !== undefined && !existing.isFile()) {
    throw new Error(`${path} is not a file`)
  }
  const text = stringify(value)
  const temporary = join(directory, `.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', mode)
  try {
    await handle.writeFile(text, 'utf8')
    await handle.chmod(mode)
    await handle.close()
    await rename(temporary, path)
    await chmod(path, mode)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  const existing = await fileMetadata(path)
  if (existing?.isSymbolicLink()) {
    throw new Error(`refusing to use symbolic link directory ${path}`)
  }
  if (existing !== undefined && !existing.isDirectory()) {
    throw new Error(`${path} is not a directory`)
  }
  await mkdir(path, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') await chmod(path, 0o700)
}

async function fileMetadata(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
