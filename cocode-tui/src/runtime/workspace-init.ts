/** Atomically create the minimal workspace instruction file. */

import { open } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const DEFAULT_AGENTS_TEMPLATE = `# Workspace instructions

Add project-specific instructions here.
`

export type AgentsFileResult = { kind: 'created'; path: string } | { kind: 'exists'; path: string }

export async function ensureAgentsFile(cwd: string): Promise<AgentsFileResult> {
  const path = join(resolve(cwd), 'AGENTS.md')
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(path, 'wx', 0o644)
  } catch (error) {
    if (isExists(error)) return { kind: 'exists', path }
    throw error
  }
  try {
    await handle.writeFile(DEFAULT_AGENTS_TEMPLATE, 'utf8')
  } finally {
    await handle.close()
  }
  return { kind: 'created', path }
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST'
}
