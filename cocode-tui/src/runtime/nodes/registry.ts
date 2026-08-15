/**
 * Ordered Definition table. Fallback is last and optional.
 */

import type { NodeDefinition } from "./types.ts";

export class NodeRegistry {
  private readonly definitions: NodeDefinition[] = [];
  private fallback: NodeDefinition | undefined;

  register(definition: NodeDefinition): void {
    if (definition.fallback === true) this.fallback = definition;
    else this.definitions.push(definition);
  }

  entries(): readonly NodeDefinition[] {
    return this.definitions;
  }

  fallbackEntry(): NodeDefinition | undefined {
    return this.fallback;
  }
}
