/** Write a session export without overwriting an existing file. */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConversationNode } from './nodes/types.ts'
import { nodesToMarkdown } from './export-markdown.ts'
import { TuiError } from './errors/index.ts'

export async function writeSessionExport(
  cwd: string,
  sessionId: string,
  nodes: readonly ConversationNode[],
): Promise<string> {
  const base = join(cwd, `cocode-export-${sessionId.slice(0, 8)}`)
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const path = `${base}${suffix}.md`
    try {
      await writeFile(path, nodesToMarkdown(nodes), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
      return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST') {
        continue
      }
      throw error
    }
  }
  throw new TuiError('SESSION_EXPORT_FAILED')
}
