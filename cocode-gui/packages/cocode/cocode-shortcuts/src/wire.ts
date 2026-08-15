import type { ShortcutsHttpRequest, ShortcutsHttpResponse } from "./context-types.ts"

export type ShortcutsRouteErrorCode =
  | "bad-request"
  | "forbidden"
  | "method-not-allowed"
  | "not-found"
  | "settings-conflict"
  | "settings-rejected"
  | "internal"

export class ShortcutsRouteError extends Error {
  constructor(
    readonly code: ShortcutsRouteErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const MAX_BODY_BYTES = 64 * 1024

export async function readJsonBody(request: ShortcutsHttpRequest): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) {
      throw new ShortcutsRouteError("bad-request", "request body too large")
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (text.trim() === "") return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ShortcutsRouteError("bad-request", "request body is not valid JSON")
  }
}

export function writeJson(
  response: ShortcutsHttpResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}

export function writeOk(response: ShortcutsHttpResponse, value: unknown): void {
  writeJson(response, 200, { ok: true, value })
}

export function writeError(response: ShortcutsHttpResponse, error: unknown): void {
  if (error instanceof ShortcutsRouteError) {
    writeJson(response, error.status, {
      ok: false,
      error: { code: error.code, message: error.message },
    })
    return
  }
  writeJson(response, 500, {
    ok: false,
    error: {
      code: "internal",
      message: error instanceof Error ? error.message : String(error),
    },
  })
}

