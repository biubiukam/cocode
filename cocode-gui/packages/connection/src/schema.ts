/**
 * Wire-boundary validation. Only the envelope and the frame discriminant are
 * validated strictly; payload bodies stay loose, mirroring the harness's own
 * posture (its `sessionEventSchema` validates the envelope and a wide `data`).
 * Validating deeper would make the GUI reject perfectly good frames the moment a
 * harness plugin merges a new field into an extensible map.
 */

import { z } from 'zod'
import type { HostFrame, MuxFrame, RpcResult, ServerResponse } from './wire.ts'

const rpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
})

const rpcResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: rpcErrorSchema }),
])

const serverResponseSchema = z.object({
  type: z.literal('server-response'),
  rpcId: z.string(),
  result: rpcResultSchema,
})

const serverRequestSchema = z.object({
  type: z.literal('server-request'),
  rpcId: z.string(),
  method: z.string(),
  payload: z.looseObject({ type: z.string() }),
})

const rpcReceiptSchema = z.union([
  z.object({ accepted: z.literal(true) }),
  z.object({ accepted: z.literal(false), reason: z.enum(['not-pending', 'bad-response']) }),
])

/** Frame `type` literals each stream may carry; anything else is dropped with a diagnostic. */
const MUX_FRAME_TYPES = new Set([
  'session/event',
  'session/subscribed',
  'approval/requested',
  'approval/resolved',
  'question/requested',
  'question/resolved',
  'session/queue',
  'session/jobs',
  'session/projection',
  'terminal/output',
  'terminal/exit',
  'stream/error',
])

const HOST_FRAME_TYPES = new Set([
  'host/session-added',
  'host/session-removed',
  'host/session-status',
  'host/agent-error',
  'host/workspace-changed',
  'host/workspace-removed',
  'host/workspace-order-changed',
  'host/archived-sessions-changed',
  'host/remote-event',
  'stream/error',
])

export type StreamKind = 'mux' | 'host'

/**
 * Parses one `server-response` envelope.
 * @param raw - the decoded JSON body of a unary POST.
 * @returns the envelope, or `undefined` when it is not a well-formed response.
 */
export function parseServerResponse(raw: unknown): ServerResponse | undefined {
  const parsed = serverResponseSchema.safeParse(raw)
  if (!parsed.success) return undefined
  // A void-returning method answers `{ ok: true }` with no `value`.
  const result = parsed.data.result as RpcResult<unknown>
  return { type: 'server-response', rpcId: parsed.data.rpcId, result }
}

/**
 * Parses one `/api/respond` receipt.
 * @param raw - the decoded JSON body of the respond POST.
 * @returns the receipt, or a `bad-response` refusal when the body is unreadable.
 */
export function parseRpcReceipt(raw: unknown) {
  const parsed = rpcReceiptSchema.safeParse(raw)
  return parsed.success ? parsed.data : ({ accepted: false, reason: 'bad-response' } as const)
}

/**
 * Parses one downlink text message into a frame of the expected stream.
 * @param text - the raw WebSocket message payload.
 * @param stream - which stream delivered it, deciding the admissible frame types.
 * @returns the rpcId and frame, or `undefined` when the message is not a usable frame.
 */
export function parseIncomingFrame(text: string, stream: StreamKind):
{ rpcId: string; frame: MuxFrame | HostFrame } | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  }
  catch {
    return undefined
  }
  const parsed = serverRequestSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const allowed = stream === 'mux' ? MUX_FRAME_TYPES : HOST_FRAME_TYPES
  const payload = parsed.data.payload
  if (!allowed.has(payload.type)) return undefined
  return { rpcId: parsed.data.rpcId, frame: payload as unknown as MuxFrame | HostFrame }
}
