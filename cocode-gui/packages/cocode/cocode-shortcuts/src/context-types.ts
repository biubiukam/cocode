import type { Context as CordisContext } from "cordis"

export interface ShortcutsHttpRequest {
  readonly url?: string
  readonly method?: string
  readonly headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

export interface ShortcutsHttpResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Uint8Array): void
}

export interface ShortcutsWebRoute {
  readonly kind: "exact" | "prefix"
  readonly path: string
  readonly handler: (
    request: ShortcutsHttpRequest,
    response: ShortcutsHttpResponse,
  ) => void | Promise<void>
}

export interface ShortcutsWebServer {
  register(route: ShortcutsWebRoute): () => void
}

export interface ShortcutsWebRuntime {
  readonly trustedHosts: readonly string[]
}

export interface ShortcutsSettingsService {
  readonly writable: boolean
  register<T>(
    namespace: string,
    schema: unknown,
  ): {
    get(): T
    watch(listener: (next: T, previous: T) => void | Promise<void>): () => void
    update(patch: object): Promise<void>
    replace(section: object): Promise<void>
  }
  describe(options?: { readonly redactSecrets?: boolean }): readonly {
    readonly ns: string
    readonly value?: unknown
    readonly base?: unknown
    readonly user?: unknown
    readonly revision: number
  }[]
  update(namespace: string, patch: object, expectedRevision?: number): Promise<void>
}

declare module "cordis" {
  interface Context {
    webServer: ShortcutsWebServer
    webRuntime: ShortcutsWebRuntime
    settings: ShortcutsSettingsService
  }
}

export type Context = CordisContext

