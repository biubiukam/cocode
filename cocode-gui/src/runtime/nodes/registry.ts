/**
 * Live Conversation Node Definition registry.
 *
 * `register` is a caller-fiber effect: unloading the plugin withdraws the
 * Definition and the next window replace rebuilds without it.
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ConversationNodeDefinition } from './types.ts'

export class NodeRegistry extends Service {
  private readonly definitions: ConversationNodeDefinition[] = []
  private fallback: ConversationNodeDefinition | undefined

  constructor(ctx: Context) {
    super(ctx, 'nodes')
  }

  /**
   * Registers one Definition.
   * @param definition - match/start/update/buildViewNode machine.
   * @returns disposer collected by the caller's fiber.
   */
  register(definition: ConversationNodeDefinition): () => void {
    return this.ctx.effect(() => {
      if (definition.fallback === true) this.fallback = definition
      else this.definitions.push(definition)
      return () => {
        const index = this.definitions.indexOf(definition)
        if (index >= 0) this.definitions.splice(index, 1)
        if (this.fallback === definition) this.fallback = undefined
      }
    }, `nodes.register(${definition.kind})`)
  }

  entries(): readonly ConversationNodeDefinition[] {
    return this.definitions
  }

  fallbackEntry(): ConversationNodeDefinition | undefined {
    return this.fallback
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    nodes: NodeRegistry
  }
}
