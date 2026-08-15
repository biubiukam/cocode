/**
 * Resolve display-only workspace information once during startup.
 */

import { execFile } from 'node:child_process'
import { basename } from 'node:path'

export type WorkspaceInfo = {
  name: string
  branch?: string
}

export type BranchQuery = (cwd: string) => Promise<string | undefined>

export async function resolveWorkspaceInfo(
  cwd: string,
  queryBranch: BranchQuery = readGitBranch,
): Promise<WorkspaceInfo> {
  let branch: string | undefined
  try {
    branch = normalizeBranch(await queryBranch(cwd))
  } catch {
    branch = undefined
  }
  return { name: workspaceName(cwd), branch }
}

export function workspaceName(cwd: string): string {
  return basename(cwd) || cwd
}

export function readGitBranch(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 },
      (error, stdout) => {
        if (error !== null) {
          resolve(undefined)
          return
        }
        resolve(normalizeBranch(stdout))
      },
    )
  })
}

function normalizeBranch(branch: string | undefined): string | undefined {
  const value = branch?.trim()
  if (value === undefined || value === '' || value === 'HEAD') {
    return undefined
  }
  return value
}
