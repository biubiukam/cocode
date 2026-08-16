/** Parse command input hints into context-aware argument completions. */

export type CommandCompletionCommand = {
  name: string
  input?: { hint: string }
}

export type CommandArgumentCompletion = {
  label: string
  insert: string
}

export type CommandArgumentCompletionState = {
  commandName: string
  query: string
  items: readonly CommandArgumentCompletion[]
}

type HintToken = {
  values: readonly string[]
}

/** Find static argument choices for the command currently being typed. */
export function commandArgumentCompletions(
  commands: readonly CommandCompletionCommand[],
  draft: string,
): CommandArgumentCompletionState | undefined {
  const match = /^\/(\S+)([\s\S]*)$/.exec(draft)
  if (match === null) return undefined
  const commandName = match[1] ?? ''
  const rest = match[2] ?? ''
  if (!/^\s/.test(rest)) return undefined

  const command = commands.find((item) => item.name.toLowerCase() === commandName.toLowerCase())
  if (command?.input === undefined) return undefined

  const trailingSpace = /\s$/.test(rest)
  const argsText = rest.trim()
  const args = argsText === '' ? [] : argsText.split(/\s+/u)
  const partial = trailingSpace ? '' : args.pop() ?? ''
  const position = args.length
  const items: CommandArgumentCompletion[] = []
  const seen = new Set<string>()

  for (const branch of parseHint(command.input.hint)) {
    if (!matchesPrefix(branch, args)) continue
    const token = branch[position]
    if (token === undefined) continue
    for (const value of token.values) {
      if (!value.toLowerCase().startsWith(partial.toLowerCase())) continue
      const prefix = `/${command.name}${args.length === 0 ? ' ' : ` ${args.join(' ')} `}`
      const insert = `${prefix}${value}${branch.length > position + 1 ? ' ' : ''}`
      const key = `${value}\u0000${insert}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ label: value, insert })
    }
  }

  if (items.length === 0) return undefined
  return { commandName: command.name, query: partial, items }
}

function matchesPrefix(branch: readonly HintToken[], args: readonly string[]): boolean {
  return args.every((arg, index) => {
    const token = branch[index]
    if (token === undefined || token.values.length === 0) return token !== undefined
    return token.values.some((value) => value.toLowerCase() === arg.toLowerCase())
  })
}

function parseHint(hint: string): HintToken[][] {
  return splitAlternatives(hint)
    .map((alternative) => tokenize(alternative).map(toHintToken))
    .filter((tokens) => tokens.length > 0)
}

function splitAlternatives(value: string): string[] {
  const alternatives: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '<') depth += 1
    else if (char === '>') depth = Math.max(0, depth - 1)
    else if (char === '|' && depth === 0) {
      alternatives.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  alternatives.push(value.slice(start).trim())
  return alternatives.filter((alternative) => alternative !== '')
}

function tokenize(value: string): string[] {
  return value.match(/<[^>]+>|\S+/gu) ?? []
}

function toHintToken(token: string): HintToken {
  if (token.startsWith('<') && token.endsWith('>')) {
    const inner = token.slice(1, -1).trim()
    const values = inner.split('|').map((value) => value.trim()).filter(Boolean)
    return { values: values.length > 1 ? values : [] }
  }
  return { values: [token] }
}
