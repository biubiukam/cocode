/** Open a draft in the user's external editor and return the edited text. */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const MAX_DRAFT_BYTES = 256 * 1024

export type EditorRunner = (
  command: string,
  args: readonly string[],
  filePath: string,
) => Promise<number>

export function parseEditorCommand(value: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: "'" | '"' | undefined
  let escaped = false
  for (const character of value.trim()) {
    if (escaped) {
      token += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (quote !== undefined) {
      if (character === quote) quote = undefined
      else token += character
    } else if (character === "'" || character === '"') {
      quote = character
    } else if (/\s/.test(character)) {
      if (token !== '') {
        tokens.push(token)
        token = ''
      }
    } else {
      token += character
    }
  }
  if (escaped) token += '\\'
  if (quote !== undefined) throw new Error('editor command has an unterminated quote')
  if (token !== '') tokens.push(token)
  return tokens
}

export async function editDraft(options: {
  text: string
  env?: NodeJS.ProcessEnv
  tempParent?: string
  runner?: EditorRunner
}): Promise<string> {
  const env = options.env ?? process.env
  const configured = env.VISUAL?.trim() || env.EDITOR?.trim()
  if (configured === undefined || configured === '') {
    throw new Error('No $VISUAL or $EDITOR is configured.')
  }
  const command = parseEditorCommand(configured)
  const executable = command[0]
  if (executable === undefined) throw new Error('Editor command is empty.')
  const directory = await mkdtemp(join(options.tempParent ?? tmpdir(), 'cocode-edit-'))
  const filePath = join(directory, 'draft.md')
  try {
    await writeFile(filePath, options.text, { encoding: 'utf8', mode: 0o600 })
    const runner = options.runner ?? runEditor
    const status = await runner(executable, command.slice(1), filePath)
    if (status !== 0) throw new Error(`Editor exited with code ${status}.`)
    const bytes = await readFile(filePath)
    if (bytes.length > MAX_DRAFT_BYTES) throw new Error('Edited draft is too large.')
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('Edited draft is not valid UTF-8 text.')
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function runEditor(command: string, args: readonly string[], filePath: string): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, [...args, filePath], { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => resolveExit(code ?? 1))
  })
}
