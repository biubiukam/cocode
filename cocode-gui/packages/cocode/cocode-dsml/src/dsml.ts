/**
 * Incremental DeepSeek DSML extractor.
 *
 * V4 expresses tool calls as markup. The endpoint is supposed to lift that
 * markup into structured `tool_calls`; when it leaks into the thinking or text
 * channel instead, this extractor recovers each invoke as it closes so the
 * agent loop can still run the tool.
 *
 * Accepted tag spellings:
 * - official fullwidth: `<｜DSML｜tool_calls>`
 * - tight ASCII: `<|DSML|tool_calls>`
 * - spaced leak: `<| DSML | tool_calls>`
 */

const FW = "\uFF5C"
const DSML = `(?:${FW}DSML${FW}|\\|\\s*DSML\\s*\\|)\\s*`
const FIND_OPEN_TOOL_CALLS = new RegExp(`<${DSML}tool_calls>`)
const CLOSE_TOOL_CALLS = new RegExp(`^</${DSML}tool_calls>`)
const OPEN_INVOKE = new RegExp(`^<${DSML}invoke\\s+name="([^"]+)">`)
const CLOSE_INVOKE = new RegExp(`^</${DSML}invoke>`)
const OPEN_PARAM = new RegExp(
  `^<${DSML}parameter\\s+name="([^"]+)"(?:\\s+string="(true|false)")?\\s*>`,
)
const CLOSE_PARAM = new RegExp(`</${DSML}parameter>`)

/**
 * Tag bodies a partial suffix may still grow into. Held-back text is released
 * as soon as it can no longer become one of these.
 */
const PARTIAL_BODIES = [
  [`${FW}DSML${FW}tool_calls`, `${FW}DSML${FW}invoke`, `${FW}DSML${FW}parameter`],
  ["| DSML | tool_calls", "| DSML | invoke", "| DSML | parameter"],
  ["|DSML|tool_calls", "|DSML|invoke", "|DSML|parameter"],
] as const

/** Visible text, or a recovered tool call. */
export type DsmlEvent =
  | { type: "text"; text: string }
  | { type: "tool-call"; name: string; arguments: string }

/**
 * Feed one streaming channel and emit cleaned text plus completed invokes.
 * Incomplete markup is held back so a partial tag never reaches the UI.
 */
export class DsmlExtractor {
  private buffer = ""
  private inToolCalls = false

  /**
   * Consume the next fragment of this channel.
   * @param fragment - raw thinking or text delta.
   * @returns events in stream order; a tool call fires as soon as its invoke closes.
   */
  push(fragment: string): DsmlEvent[] {
    if (fragment.length === 0) return []
    this.buffer += fragment
    return this.drain()
  }

  /**
   * Release held text at end of channel. A truncated invoke is dropped rather
   * than guessed at, since half a call is worse than none.
   * @returns remaining visible text, plus any invoke that became complete.
   */
  flush(): DsmlEvent[] {
    const events = this.drain()
    if (this.inToolCalls) {
      this.buffer = ""
      this.inToolCalls = false
      return events
    }
    if (this.buffer.length > 0) {
      events.push({ type: "text", text: this.buffer })
      this.buffer = ""
    }
    return events
  }

  private drain(): DsmlEvent[] {
    const events: DsmlEvent[] = []
    while (this.buffer.length > 0) {
      if (!this.inToolCalls) {
        const match = FIND_OPEN_TOOL_CALLS.exec(this.buffer)
        if (match !== null) {
          const before = this.buffer.slice(0, match.index)
          if (before.length > 0) events.push({ type: "text", text: before })
          this.buffer = this.buffer.slice(match.index + match[0].length)
          this.inToolCalls = true
          continue
        }
        const hold = heldTagSuffixLength(this.buffer)
        const visible = this.buffer.slice(0, this.buffer.length - hold)
        if (visible.length > 0) events.push({ type: "text", text: visible })
        this.buffer = this.buffer.slice(visible.length)
        break
      }

      const invoke = tryParseInvoke(this.buffer)
      if (invoke !== undefined) {
        events.push({ type: "tool-call", name: invoke.name, arguments: invoke.arguments })
        this.buffer = this.buffer.slice(invoke.consumed)
        continue
      }

      const start = skipWs(this.buffer, 0)
      const close = this.buffer.slice(start).match(CLOSE_TOOL_CALLS)
      if (close) {
        this.buffer = this.buffer.slice(start + close[0].length)
        this.inToolCalls = false
        continue
      }

      // Junk between invokes: skip to the next tag rather than emitting it as
      // visible text, since everything inside tool_calls is markup.
      const nextTag = this.buffer.indexOf("<", start)
      if (start < this.buffer.length && this.buffer[start] !== "<" && nextTag !== -1) {
        this.buffer = this.buffer.slice(nextTag)
        continue
      }
      break
    }
    return events
  }
}

function skipWs(value: string, index: number): number {
  let cursor = index
  while (cursor < value.length && /\s/.test(value[cursor] ?? "")) cursor += 1
  return cursor
}

/** A `string="true"` parameter stays literal; anything else is parsed as JSON. */
function decodeParam(raw: string, stringFlag: string | undefined): unknown {
  if (stringFlag === "true") return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Parse one complete invoke from the head of the buffer.
 * @returns the call and how much it consumed, or undefined while incomplete.
 */
function tryParseInvoke(
  buffer: string,
): { name: string; arguments: string; consumed: number } | undefined {
  const start = skipWs(buffer, 0)
  const open = buffer.slice(start).match(OPEN_INVOKE)
  if (!open) return undefined
  let cursor = start + open[0].length
  const params: Record<string, unknown> = {}
  while (true) {
    cursor = skipWs(buffer, cursor)
    if (cursor >= buffer.length) return undefined
    const closeInvoke = buffer.slice(cursor).match(CLOSE_INVOKE)
    if (closeInvoke) {
      return {
        name: open[1] ?? "",
        arguments: JSON.stringify(params),
        consumed: cursor + closeInvoke[0].length,
      }
    }
    const openParam = buffer.slice(cursor).match(OPEN_PARAM)
    if (openParam) {
      const valueStart = cursor + openParam[0].length
      const rest = buffer.slice(valueStart)
      const closeParam = rest.match(CLOSE_PARAM)
      if (closeParam === null || closeParam.index === undefined) return undefined
      params[openParam[1] ?? ""] = decodeParam(rest.slice(0, closeParam.index), openParam[2])
      cursor = valueStart + closeParam.index + closeParam[0].length
      continue
    }
    if (buffer[cursor] === "<" && !buffer.slice(cursor).includes(">")) return undefined
    const next = buffer.indexOf("<", cursor + 1)
    if (next === -1) return undefined
    cursor = next
  }
}

/** How many trailing characters could still grow into a DSML tag. */
function heldTagSuffixLength(buffer: string): number {
  const index = buffer.lastIndexOf("<")
  if (index === -1) return 0
  const suffix = buffer.slice(index)
  if (suffix.includes(">")) return 0
  return couldBeDsmlTag(suffix) ? suffix.length : 0
}

function couldBeDsmlTag(open: string): boolean {
  if (!open.startsWith("<")) return false
  const body = open.startsWith("</") ? open.slice(2) : open.slice(1)
  if (body.length === 0) return true
  const [official, spaced, tight] = PARTIAL_BODIES
  return (
    official.some(target => target.startsWith(body)) ||
    spaced.some(target => target.startsWith(body.replace(/\s+/g, " "))) ||
    tight.some(target => target.startsWith(body.replace(/\s+/g, "")))
  )
}
