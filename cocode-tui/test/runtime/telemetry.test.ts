import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cocode/tui-connection'
import { createTelemetryProjector } from '../../src/runtime/telemetry.ts'

function event(type: string, time: number, data: unknown): SessionEvent {
  return { type, seq: time, time, data }
}

describe('TelemetryProjector', () => {
  it('projects latest usage, totals, cache, context, and reasoning effort', () => {
    const projector = createTelemetryProjector()
    projector.ingest(event('request/context', 1, { contextWindow: 1000 }))
    projector.ingest(
      event('request/header', 2, {
        header: {
          system: 'system prompt',
          config: { reasoningEffort: 'high' },
        },
      }),
    )
    projector.ingest(
      event('assistant/chunk', 3, {
        chunk: {
          type: 'usage',
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            cacheReadTokens: 300,
            cacheWriteTokens: 4,
          },
        },
      }),
    )
    projector.ingest(
      event('assistant/message', 4, {
        message: { content: [{ type: 'text', text: 'done' }] },
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 300,
          cacheWriteTokens: 4,
        },
      }),
    )

    expect(projector.snapshot()).toMatchObject({
      usage: { input: 100, output: 20, cacheRead: 300, cacheWrite: 4 },
      totals: { input: 100, output: 20 },
      cacheHitRate: 75,
      contextWindow: 1000,
      contextPercent: 40,
      reasoningEffort: 'high',
    })
    expect(projector.snapshot().contextSegments.system).toBe(4)
    expect(projector.snapshot().contextSegments.assistant).toBe(1)
  })

  it('estimates activity and bounded TPS samples without duplicating chunk usage', () => {
    const projector = createTelemetryProjector()
    projector.ingest(
      event('activity/status', 1, {
        phase: 'tool',
        line: 'Reading\u001b[2K file',
        toolCount: 2,
        turnElapsedMs: 12,
      }),
    )
    projector.ingest(event('turn/start', 1000, { turn: 1 }))
    projector.ingest(
      event('assistant/chunk', 1100, {
        turn: 1,
        chunk: { type: 'text-delta', text: '12345678' },
      }),
    )
    projector.ingest(
      event('assistant/chunk', 1200, {
        turn: 1,
        chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
      }),
    )
    projector.ingest(
      event('assistant/message', 1300, {
        usage: { inputTokens: 10, outputTokens: 2 },
        message: { content: [{ type: 'text', text: '12345678' }] },
      }),
    )
    expect(projector.snapshot().activity).toEqual({
      phase: 'tool',
      line: 'Reading file',
      toolCount: 2,
      turnElapsedMs: 12,
    })
    projector.ingest(event('turn/end', 1400, { turn: 1 }))
    const snapshot = projector.snapshot()
    expect(snapshot.activity).toBeUndefined()
    expect(snapshot.totals).toEqual({ input: 10, output: 2 })
    expect(snapshot.tps).toBeGreaterThan(0)
    expect(snapshot.tpsSamples).toHaveLength(1)
  })

  it('resets all projected state', () => {
    const projector = createTelemetryProjector()
    projector.ingest(
      event('assistant/message', 1, {
        usage: { inputTokens: 1, outputTokens: 2 },
        message: { content: [{ type: 'text', text: 'x' }] },
      }),
    )
    projector.reset()
    expect(projector.snapshot()).toEqual({
      totals: { input: 0, output: 0 },
      tpsSamples: [],
      contextSegments: {
        system: 0,
        prompt: 0,
        assistant: 0,
        thinking: 0,
        tools: 0,
      },
    })
  })
})
