import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { devNull } from 'node:os'
import { parseDiffSummary, type DiffSummary } from './diff-summary.ts'

const execFile = promisify(nodeExecFile)
const MAX_PATCH_CHARS = 120_000
const MAX_EXEC_BUFFER = 8 * 1024 * 1024
const MAX_UNTRACKED_FILES = 40

export type ReviewScope = 'working-tree' | 'staged' | 'last-commit' | 'branch'

export type ReviewFile = {
  path: string
  additions: number
  deletions: number
  binary: boolean
  truncated: boolean
  untracked?: boolean
}

export type GitReview = {
  scope: ReviewScope
  base?: string
  files: readonly ReviewFile[]
  additions: number
  deletions: number
  binaryFiles: number
  patch: string
  truncated: boolean
  omittedFiles: readonly string[]
  /** Bounded structured projection used by the review preview. */
  diffSummary?: DiffSummary
  prompt: string
}

export type GitRunner = (
  args: readonly string[],
  options?: { allowExitCodes?: readonly number[]; cwd?: string },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

export async function collectGitReview(
  cwd: string,
  scope: ReviewScope,
  base?: string,
  runner: GitRunner = runGit,
): Promise<GitReview> {
  const root = await runner(['rev-parse', '--show-toplevel'], { cwd })
  if (root.exitCode !== 0) throw new Error(cleanError(root.stderr, 'Not a Git repository'))

  let diffArgs: string[]
  let resolvedBase = base?.trim() || undefined
  if (scope === 'working-tree') {
    diffArgs = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--unified=3',
      'HEAD',
      '--',
    ]
  } else if (scope === 'staged') {
    diffArgs = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--cached',
      '--no-color',
      '--no-ext-diff',
      '--unified=3',
      '--',
    ]
  } else if (scope === 'last-commit') {
    diffArgs = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--unified=3',
      'HEAD^',
      'HEAD',
      '--',
    ]
  } else {
    resolvedBase ??= await resolveBranchBase(runner, cwd)
    const mergeBase = await runner(['merge-base', resolvedBase, 'HEAD'], { cwd })
    if (mergeBase.exitCode !== 0)
      throw new Error(cleanError(mergeBase.stderr, `Cannot resolve branch base: ${resolvedBase}`))
    diffArgs = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--unified=3',
      `${mergeBase.stdout.trim()}..HEAD`,
      '--',
    ]
  }

  const diff = await runner(diffArgs, { allowExitCodes: [0, 1], cwd })
  if (diff.exitCode !== 0 && diff.stdout === '')
    throw new Error(cleanError(diff.stderr, 'Git diff failed'))
  let patch = sanitizeText(diff.stdout)
  let truncated = false
  if (patch.length > MAX_PATCH_CHARS) {
    patch = `${patch.slice(0, MAX_PATCH_CHARS)}\n[diff truncated by Cocode TUI]`
    truncated = true
  }
  const parsed = parseDiffSummary(patch)
  const untracked =
    scope === 'working-tree'
      ? await collectUntracked(cwd, runner)
      : { patch: '', omitted: [] as string[], truncated: false }
  const files: ReviewFile[] = parsed.files.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    truncated: file.truncated,
  }))
  const omittedFiles = [...untracked.omitted]
  if (untracked.patch !== '') {
    const untrackedParsed = parseDiffSummary(untracked.patch)
    for (const file of untrackedParsed.files) {
      files.push({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        binary: file.binary,
        truncated: file.truncated,
        untracked: true,
      })
    }
    patch = patch === '' ? untracked.patch : `${patch}\n${untracked.patch}`
    if (patch.length > MAX_PATCH_CHARS) {
      patch = `${patch.slice(0, MAX_PATCH_CHARS)}\n[diff truncated by Cocode TUI]`
      truncated = true
    }
  }
  const additions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)
  const binaryFiles = files.filter((file) => file.binary).length
  const diffSummary = parseDiffSummary(patch)
  const result: GitReview = {
    scope,
    ...(resolvedBase === undefined ? {} : { base: resolvedBase }),
    files,
    additions,
    deletions,
    binaryFiles,
    patch,
    truncated: truncated || parsed.truncated || untracked.truncated,
    omittedFiles,
    ...(diffSummary.files.length === 0 ? {} : { diffSummary }),
    prompt: '',
  }
  result.prompt = buildReviewPrompt(result)
  return result
}

export function buildReviewPrompt(review: Omit<GitReview, 'prompt'>): string {
  const scope =
    review.scope === 'branch' && review.base ? `branch against ${review.base}` : review.scope
  const files =
    review.files.length === 0
      ? '(no changed files)'
      : review.files
          .map((file) => {
            const flags = [
              file.binary ? 'binary' : '',
              file.untracked ? 'untracked' : '',
              file.truncated ? 'truncated' : '',
            ]
              .filter(Boolean)
              .join(', ')
            return `- ${file.path} (+${file.additions}/-${file.deletions})${
              flags ? ` [${flags}]` : ''
            }`
          })
          .join('\n')
  const omitted =
    review.omittedFiles.length === 0
      ? ''
      : `\nOmitted untracked files: ${review.omittedFiles.join(', ')}`
  return [
    'Review the following read-only Git diff for the current workspace.',
    `Scope: ${scope}`,
    `Summary: ${review.files.length} files, +${review.additions}/-${review.deletions}${
      review.truncated ? ', patch truncated' : ''
    }.`,
    'Changed files:',
    files,
    omitted,
    '',
    'Find only concrete defects or maintainability risks introduced by this change.',
    'For each finding use exactly: [severity] file:line — problem; reason; concrete fix.',
    'Use severity critical, high, medium, or low. Include line numbers when available.',
    'If there are no findings, state that clearly. Do not invent issues.',
    '',
    'Patch:',
    review.patch || '(empty diff)',
  ].join('\n')
}

export function parseReviewScope(value: string): { scope: ReviewScope; base?: string } | undefined {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  const name = (parts[0] ?? '').toLowerCase()
  if (name === '') return undefined
  if (name === 'working-tree' || name === 'working' || name === 'worktree')
    return { scope: 'working-tree' }
  if (name === 'staged' || name === 'index') return { scope: 'staged' }
  if (name === 'last-commit' || name === 'last' || name === 'commit')
    return { scope: 'last-commit' }
  if (name === 'branch') return { scope: 'branch', ...(parts[1] ? { base: parts[1] } : {}) }
  return undefined
}

async function resolveBranchBase(runner: GitRunner, cwd: string): Promise<string> {
  const upstream = await runner(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { cwd },
  )
  if (upstream.exitCode === 0 && upstream.stdout.trim() !== '') return upstream.stdout.trim()
  for (const candidate of ['main', 'master']) {
    const result = await runner(['rev-parse', '--verify', candidate], { cwd })
    if (result.exitCode === 0) return candidate
  }
  throw new Error('Cannot find an upstream, main, or master branch')
}

async function collectUntracked(
  cwd: string,
  runner: GitRunner,
): Promise<{ patch: string; omitted: string[]; truncated: boolean }> {
  const status = await runner(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd })
  if (status.exitCode !== 0) return { patch: '', omitted: [], truncated: false }
  const entries = status.stdout
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => sanitizeText(entry.slice(3)))
  const omitted = entries.slice(MAX_UNTRACKED_FILES)
  let patch = ''
  const truncated = omitted.length > 0
  for (const path of entries.slice(0, MAX_UNTRACKED_FILES)) {
    const result = await runner(
      ['diff', '--no-index', '--no-color', '--no-ext-diff', '--unified=3', '--', devNull, path],
      { allowExitCodes: [0, 1], cwd },
    )
    if (result.stdout === '') {
      omitted.push(path)
      continue
    }
    patch += `${sanitizeText(result.stdout)}\n`
  }
  return { patch, omitted, truncated }
}

async function runGit(
  args: readonly string[],
  options: { allowExitCodes?: readonly number[]; cwd?: string } = {},
) {
  try {
    const result = await execFile('git', [...args], {
      cwd: options.cwd ?? process.cwd(),
      windowsHide: true,
      maxBuffer: MAX_EXEC_BUFFER,
    })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (error: unknown) {
    const value = error as { stdout?: string; stderr?: string; code?: string | number }
    const exitCode = typeof value.code === 'number' ? value.code : 1
    if (options.allowExitCodes?.includes(exitCode)) {
      return { stdout: value.stdout ?? '', stderr: value.stderr ?? '', exitCode }
    }
    return { stdout: value.stdout ?? '', stderr: value.stderr ?? '', exitCode }
  }
}

function cleanError(value: string, fallback: string): string {
  const cleaned = [...value]
    .filter((char) => char === '\n' || char.charCodeAt(0) >= 0x20)
    .join('')
    .trim()
  return cleaned || fallback
}

function sanitizeText(value: string): string {
  return [...value]
    .filter((char) => char === '\n' || char === '\r' || char === '\t' || char.charCodeAt(0) >= 0x20)
    .join('')
}
