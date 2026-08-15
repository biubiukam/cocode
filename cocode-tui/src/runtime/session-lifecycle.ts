/** Helpers for creating and loading session state without UI concerns. */

import { createAssembler, type Assembler } from './assembler.ts'
import { replaySessionEvents } from './sessions-fs.ts'
import { createSessionStateProjector, type SessionStateProjector } from './session-state.ts'
import { createTelemetryProjector, type TelemetryProjector } from './telemetry.ts'

export type SessionProjection = {
  assembler: Assembler
  telemetry: TelemetryProjector
  sessionState: SessionStateProjector
}

export function createSessionProjection(): SessionProjection {
  return {
    assembler: createAssembler(),
    telemetry: createTelemetryProjector(),
    sessionState: createSessionStateProjector(),
  }
}

export async function loadSessionProjection(path: string): Promise<SessionProjection> {
  const projection = createSessionProjection()
  await replaySessionEvents(path, (event) => {
    projection.assembler.ingest(event)
    projection.telemetry.ingest(event)
    projection.sessionState.ingest(event)
  })
  return projection
}

export function createSessionId(): string {
  return crypto.randomUUID()
}
