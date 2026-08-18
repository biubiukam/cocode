import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"
import { baseName } from "../paths.ts"
import { listMentionPaths } from "./file-index.ts"
import { bindWorkbenchCwd, workbenchCwd } from "./runtime-api.ts"

const SOURCE_NAME = "file"
const SOURCE_ORDER = -10
const CACHE_TTL_MS = 8_000
const CANDIDATE_LIMIT = 20
const PLAIN_PATH = /^[\w./:@+~-]+$/u

interface PathIndex {
  readonly paths: readonly string[]
  readonly fetchedAt: number
}

interface FileCandidate {
  readonly name: string
  readonly description?: string
}

interface InputTriggers {
  registerSource(source: {
    readonly trigger: "@"
    readonly name: string
    readonly order: number
    candidates(
      session: { readonly sessionId: string },
      req: { readonly query: string; readonly signal: AbortSignal },
    ): Promise<readonly FileCandidate[]>
    warm(session: { readonly sessionId: string }): void
    lexicon(session: { readonly sessionId: string }): readonly string[] | undefined
    subscribeLexicon(session: { readonly sessionId: string }, listener: () => void): () => void
    onPick(pick: { readonly candidate: FileCandidate }): { readonly text: string }
  }): () => void
}

/**
 * `@` file source: index the session workspace, rank locally, insert `@path`.
 * A failed or missing `fs.search` falls back to `fs.tree` so the menu does
 * not open-and-close empty.
 */
export function registerFileMention(ctx: ClientContext): void {
  const inputTriggers = readInputTriggers(ctx)
  if (inputTriggers === undefined) return
  const cache = new Map<string, PathIndex>()
  const inflight = new Map<string, Promise<readonly string[]>>()
  const lexiconListeners = new Map<string, Set<() => void>>()

  const notifyLexicon = (sessionId: string): void => {
    for (const listener of [...(lexiconListeners.get(sessionId) ?? [])]) {
      try {
        listener()
      } catch (error) {
        console.error("[cocode-workbench] lexicon listener failed:", error)
      }
    }
  }

  const load = async (sessionId: string): Promise<readonly string[]> => {
    const hit = cache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.paths
    const pending = inflight.get(sessionId)
    if (pending !== undefined) return pending
    const request = listMentionPaths(sessionId, sessionCwd(ctx, sessionId)).then((paths) => {
      if (paths.length > 0) {
        cache.set(sessionId, { paths, fetchedAt: Date.now() })
        notifyLexicon(sessionId)
      }
      return paths
    }).finally(() => {
      inflight.delete(sessionId)
    })
    inflight.set(sessionId, request)
    return request
  }

  ctx.effect(() => {
    const unregister = inputTriggers.registerSource({
      trigger: "@",
      name: SOURCE_NAME,
      order: SOURCE_ORDER,
      async candidates(session, { query, signal }) {
        const paths = await load(session.sessionId)
        if (signal.aborted) return []
        return rankPaths(paths, normalizeQuery(query), CANDIDATE_LIMIT).map(toCandidate)
      },
      warm(session) {
        load(session.sessionId).catch(() => {})
      },
      lexicon(session) {
        return cache.get(session.sessionId)?.paths
      },
      subscribeLexicon(session, listener) {
        const key = session.sessionId
        const listeners = lexiconListeners.get(key) ?? new Set<() => void>()
        listeners.add(listener)
        lexiconListeners.set(key, listeners)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) lexiconListeners.delete(key)
        }
      },
      onPick({ candidate }) {
        return { text: `${formatFileMention(insertPath(candidate))} ` }
      },
    })
    return () => {
      unregister()
      cache.clear()
      inflight.clear()
      lexiconListeners.clear()
    }
  }, "cocode-workbench: @ file source")
  ctx.on("connection/reset", () => {
    const keys = new Set([...cache.keys(), ...lexiconListeners.keys()])
    cache.clear()
    inflight.clear()
    for (const key of keys) notifyLexicon(key)
  })
}

function sessionCwd(ctx: ClientContext, sessionId: string): string | undefined {
  const sessions = ctx.get("sessions") as {
    list?: { getSnapshot?: () => { byId?: Record<string, { cwd?: string }> } }
  } | undefined
  const listed = sessions?.list?.getSnapshot?.().byId?.[sessionId]?.cwd
  if (listed !== undefined && listed.trim() !== "") {
    bindWorkbenchCwd(listed)
    return listed
  }
  return workbenchCwd()
}

function readInputTriggers(ctx: ClientContext): InputTriggers | undefined {
  const named = (ctx as ClientContext & { inputTriggers?: InputTriggers }).inputTriggers
  if (named !== undefined) return named
  return ctx.get("inputTriggers") as InputTriggers | undefined
}

function toCandidate(path: string): FileCandidate {
  const folder = path.endsWith("/")
  const trimmed = folder ? path.slice(0, -1) : path
  const label = folder ? `${baseName(trimmed)}/` : baseName(trimmed)
  const slash = trimmed.lastIndexOf("/")
  if (slash < 0) return { name: label }
  return { name: label, description: trimmed.slice(0, slash) }
}

function insertPath(candidate: FileCandidate): string {
  if (candidate.description === undefined) return candidate.name
  return `${candidate.description}/${candidate.name}`
}

function formatFileMention(path: string): string {
  if (PLAIN_PATH.test(path)) return `@${path}`
  return `@"${path.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`
}

function rankPaths(paths: readonly string[], query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase()
  return paths
    .map((path, index) => ({ path, index, score: pathScore(path, needle) }))
    .filter((entry) => entry.score !== undefined)
    .sort((left, right) => (right.score as number) - (left.score as number) || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.path)
}

function normalizeQuery(query: string): string {
  const trimmed = query.trim()
  return trimmed.startsWith("\"") ? trimmed.slice(1).replaceAll("\\\"", "\"") : trimmed
}

function pathScore(path: string, query: string): number | undefined {
  if (query === "") return 0
  const lower = path.toLowerCase()
  const base = lower.slice(Math.max(0, lower.lastIndexOf("/") + 1)).replace(/\/$/, "")
  if (lower === query) return 1_000
  if (base.startsWith(query)) return 800 - base.length / 100
  if (lower.startsWith(query)) return 700 - lower.length / 100
  const index = lower.indexOf(query)
  if (index >= 0) return 500 - index - lower.length / 100
  let cursor = 0
  for (const character of query) {
    cursor = lower.indexOf(character, cursor)
    if (cursor < 0) return undefined
    cursor += 1
  }
  return 100 - lower.length / 100
}
