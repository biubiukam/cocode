/** Project optional session events into observable runtime metrics. */

import type { SessionEvent } from '@cocode/tui-connection'
import { asNumber, asString, isRecord } from './text.ts'

export type TelemetryUsage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type TelemetryActivity = {
  phase: string
  line: string
  toolCount: number
  turnElapsedMs: number
}

export type TelemetrySnapshot = {
  usage?: TelemetryUsage
  totals: { input: number; output: number }
  cacheHitRate?: number
  tps?: number
  tpsSamples: readonly number[]
  contextWindow?: number
  contextPercent?: number
  contextSegments: {
    system: number
    prompt: number
    assistant: number
    thinking: number
    tools: number
  }
  reasoningEffort?: string
  activity?: TelemetryActivity
}

export type TelemetryProjector = {
  ingest(event: SessionEvent): void
  snapshot(): TelemetrySnapshot
  reset(): void
}

type TurnState = {
  turn?: number
  firstTokenTime?: number
  outputChars: number
  outputTokens?: number
}

const EMPTY_SEGMENTS = {
  system: 0,
  prompt: 0,
  assistant: 0,
  thinking: 0,
  tools: 0,
}

export function createTelemetryProjector(): TelemetryProjector {
  return new TelemetryProjectorImpl()
}

class TelemetryProjectorImpl implements TelemetryProjector {
  private usage: TelemetryUsage | undefined
  private totals = { input: 0, output: 0 }
  private tps: number | undefined
  private readonly tpsSamples: number[] = []
  private contextWindow: number | undefined
  private readonly contextSegments = { ...EMPTY_SEGMENTS }
  private reasoningEffort: string | undefined
  private activity: TelemetryActivity | undefined
  private turn: TurnState = { outputChars: 0 }

  reset(): void {
    this.usage = undefined
    this.totals = { input: 0, output: 0 }
    this.tps = undefined
    this.tpsSamples.length = 0
    this.contextWindow = undefined
    Object.assign(this.contextSegments, EMPTY_SEGMENTS)
    this.reasoningEffort = undefined
    this.activity = undefined
    this.turn = { outputChars: 0 }
  }

  ingest(event: SessionEvent): void {
    const data = isRecord(event.data) ? event.data : {}
    switch (event.type) {
      case 'turn/start':
        this.turn = { turn: numberOrUndefined(data.turn), outputChars: 0 }
        return
      case 'turn/end':
        this.finishTurn(event.time)
        return
      case 'assistant/chunk':
        this.ingestAssistantChunk(event.time, data)
        return
      case 'assistant/message':
        this.ingestAssistantMessage(event.time, data)
        return
      case 'request/context':
        this.ingestContext(data)
        return
      case 'request/header':
        this.ingestHeader(data)
        return
      case 'activity/status':
        this.ingestActivity(data)
        return
      case 'user/message':
        this.contextSegments.prompt += estimateTextTokens(contentText(data.content))
        return
      case 'tool/call':
        this.contextSegments.tools += estimateTextTokens(
          `${asString(data.name)}${asString(data.arguments)}`,
        )
        return
      case 'tool/result':
        this.contextSegments.tools += estimateTextTokens(contentText(data.message))
        return
      default:
        return
    }
  }

  snapshot(): TelemetrySnapshot {
    const usage = this.usage
    const contextTokens = usage === undefined ? undefined : usage.input + usage.cacheRead
    return {
      ...(usage === undefined ? {} : { usage }),
      totals: { ...this.totals },
      ...(usage === undefined ? {} : { cacheHitRate: cacheHitRate(usage) }),
      ...(this.tps === undefined ? {} : { tps: this.tps }),
      tpsSamples: [...this.tpsSamples],
      ...(this.contextWindow === undefined ? {} : { contextWindow: this.contextWindow }),
      ...(contextTokens === undefined || this.contextWindow === undefined
        ? {}
        : {
            contextPercent: Math.min(
              100,
              Number(((contextTokens / this.contextWindow) * 100).toFixed(1)),
            ),
          }),
      contextSegments: { ...this.contextSegments },
      ...(this.reasoningEffort === undefined ? {} : { reasoningEffort: this.reasoningEffort }),
      ...(this.activity === undefined ? {} : { activity: { ...this.activity } }),
    }
  }

  private ingestAssistantChunk(time: number, data: Record<string, unknown>): void {
    const chunk = isRecord(data.chunk) ? data.chunk : {}
    if (chunk.type === 'usage') {
      const usage = parseUsage(chunk.usage)
      if (usage !== undefined) {
        this.turn.outputTokens = usage.output
        this.recordUsage(usage, false)
      }
      return
    }
    if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') return
    const value = asString(chunk.text)
    if (value === '') return
    if (chunk.type === 'reasoning-delta') {
      this.contextSegments.thinking += estimateTextTokens(value)
    } else {
      this.contextSegments.assistant += estimateTextTokens(value)
    }
    this.turn.firstTokenTime ??= finiteTime(time)
    this.turn.outputChars += value.length
    this.updateTps(time, undefined)
  }

  private ingestAssistantMessage(time: number, data: Record<string, unknown>): void {
    const usage = parseUsage(data.usage)
    if (usage !== undefined) {
      this.turn.outputTokens = usage.output
      this.recordUsage(usage, true)
    }
    const message = isRecord(data.message) ? data.message : {}
    for (const block of blocksOf(message.content)) {
      const value = asString(block.text)
      if (value === '') continue
      if (block.type === 'reasoning') this.contextSegments.thinking += estimateTextTokens(value)
      else if (block.type === 'text') this.contextSegments.assistant += estimateTextTokens(value)
    }
    this.updateTps(time, this.turn.outputTokens)
  }

  private ingestContext(data: Record<string, unknown>): void {
    const window = numberOrUndefined(data.contextWindow)
    if (window !== undefined && window > 0) this.contextWindow = window
  }

  private ingestHeader(data: Record<string, unknown>): void {
    const header = isRecord(data.header) ? data.header : {}
    const config = isRecord(header.config) ? header.config : {}
    const effort = asString(config.reasoningEffort)
    if (effort !== '') this.reasoningEffort = safeLine(effort, 40)
    this.contextSegments.system += estimateTextTokens(asString(header.system))
  }

  private ingestActivity(data: Record<string, unknown>): void {
    const line = safeLine(asString(data.line), 160)
    if (line === '') return
    this.activity = {
      phase: safeLine(asString(data.phase), 32),
      line,
      toolCount: Math.max(0, asNumber(data.toolCount)),
      turnElapsedMs: Math.max(0, asNumber(data.turnElapsedMs)),
    }
  }

  private recordUsage(usage: TelemetryUsage, accumulate: boolean): void {
    this.usage = usage
    if (accumulate) {
      this.totals.input += usage.input
      this.totals.output += usage.output
    }
  }

  private updateTps(time: number, outputTokens: number | undefined): void {
    const first = this.turn.firstTokenTime
    if (first === undefined) return
    const elapsed = time - first
    if (!Number.isFinite(elapsed) || elapsed <= 0) return
    const tokens = outputTokens ?? Math.ceil(this.turn.outputChars / 4)
    if (tokens <= 0) return
    this.tps = tokens / (elapsed / 1000)
  }

  private finishTurn(time: number): void {
    this.updateTps(time, this.turn.outputTokens)
    if (this.tps !== undefined) {
      this.tpsSamples.push(this.tps)
      if (this.tpsSamples.length > 64) this.tpsSamples.shift()
    }
    this.activity = undefined
    this.turn = { outputChars: 0 }
  }
}

function parseUsage(value: unknown): TelemetryUsage | undefined {
  if (!isRecord(value)) return undefined
  const input = numberOrUndefined(value.inputTokens)
  const output = numberOrUndefined(value.outputTokens)
  const cacheRead = asNumber(value.cacheReadTokens)
  const cacheWrite = asNumber(value.cacheWriteTokens)
  if (input === undefined && output === undefined && cacheRead === 0 && cacheWrite === 0) {
    return undefined
  }
  return {
    input: Math.max(0, input ?? 0),
    output: Math.max(0, output ?? 0),
    cacheRead: Math.max(0, cacheRead),
    cacheWrite: Math.max(0, cacheWrite),
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function cacheHitRate(usage: TelemetryUsage): number | undefined {
  const total = usage.input + usage.cacheRead
  if (total <= 0) return undefined
  return (usage.cacheRead / total) * 100
}

function contentText(value: unknown): string {
  if (isRecord(value)) return contentText(value.content)
  return blocksOf(value)
    .map((block) => asString(block.text))
    .join('')
}

function blocksOf(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

function estimateTextTokens(value: string): number {
  return value === '' ? 0 : Math.ceil(value.length / 4)
}

function finiteTime(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined
}

function safeLine(value: string, maxLength: number): string {
  const ansiEscape = String.fromCharCode(0x1b)
  const withoutAnsi = value.replace(new RegExp(`${ansiEscape}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
  return [...withoutAnsi]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .slice(0, maxLength)
}
