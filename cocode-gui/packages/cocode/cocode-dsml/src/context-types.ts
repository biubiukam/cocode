import type { Context as CordisContext } from "cordis"
import type { StreamChunk } from "@deepseek-ai/dsh-llm"

/**
 * The seam this plugin wraps. dsh-llm declares the same waterfall against the
 * Harness-owned cordis fork; plugins here speak bare `cordis`, so the shape is
 * restated locally the way sibling plugins restate the services they use.
 *
 * `options` stays opaque: the transform is decided by what the model actually
 * emits, never by the request, so nothing here needs to read it.
 */
declare module "cordis" {
  interface Events {
    "llm/stream"(
      options: unknown,
      next: () => AsyncIterable<StreamChunk>,
    ): AsyncIterable<StreamChunk>
  }
}

export type Context = CordisContext
