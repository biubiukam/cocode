/**
 * Incremental SessionEvent → ConversationNode engine.
 */

import type { SessionEvent } from "@cocode/tui-connection";
import type { ConversationNode, NodeDefinition } from "./nodes/types.ts";
import { nodeKey } from "./nodes/types.ts";
import type { NodeRegistry } from "./nodes/registry.ts";
import { createBuiltinRegistry } from "./nodes/builtins.ts";

type InternalContext = {
  key: string;
  kind: string;
  id: string;
  definition: NodeDefinition;
  startSeq: number;
  state: unknown;
  dirty: boolean;
  node: ConversationNode | null;
};

export type Assembler = {
  ingest(event: SessionEvent): void;
  replaceWindow(events: readonly SessionEvent[]): void;
  snapshot(): readonly ConversationNode[];
  reset(): void;
};

export function createAssembler(registry?: NodeRegistry): Assembler {
  return new ConversationAssembler(registry ?? createBuiltinRegistry());
}

class ConversationAssembler implements Assembler {
  private readonly contexts = new Map<string, InternalContext>();
  private readonly order: InternalContext[] = [];
  private cache: readonly ConversationNode[] = [];
  private cacheValid = true;
  private highestSeq = -1;

  constructor(private readonly registry: NodeRegistry) {}

  reset(): void {
    this.contexts.clear();
    this.order.length = 0;
    this.cache = [];
    this.cacheValid = true;
    this.highestSeq = -1;
  }

  replaceWindow(events: readonly SessionEvent[]): void {
    this.reset();
    for (const event of events) this.ingest(event);
  }

  ingest(event: SessionEvent): void {
    if (event.seq <= this.highestSeq) return;
    this.highestSeq = event.seq;
    const matched = this.matchEvent(event);
    if (matched === undefined) return;
    if (matched.role === "start") {
      this.startContext(matched.definition, matched.id, event);
    } else {
      this.updateContext(matched.definition, matched.id, event);
    }
  }

  snapshot(): readonly ConversationNode[] {
    if (this.cacheValid) return this.cache;
    const next: ConversationNode[] = [];
    for (const context of this.order) {
      if (context.dirty) {
        context.node = context.definition.buildViewNode({
          kind: context.kind,
          id: context.id,
          startSeq: context.startSeq,
          state: context.state,
        });
        context.dirty = false;
      }
      if (context.node !== null) next.push(context.node);
    }
    this.cache = next;
    this.cacheValid = true;
    return this.cache;
  }

  private matchEvent(event: SessionEvent):
    | {
        definition: NodeDefinition;
        id: string;
        role: "start" | "update";
      }
    | undefined {
    for (const definition of this.registry.entries()) {
      const result = definition.match(event);
      if (result === null) continue;
      return { definition, id: result.id, role: result.role };
    }
    const fallback = this.registry.fallbackEntry();
    if (fallback === undefined) return undefined;
    const result = fallback.match(event);
    if (result === null) return undefined;
    return { definition: fallback, id: result.id, role: result.role };
  }

  private startContext(
    definition: NodeDefinition,
    id: string,
    event: SessionEvent,
  ): void {
    const key = nodeKey(definition.kind, id);
    if (this.contexts.has(key)) {
      this.updateContext(definition, id, event);
      return;
    }
    const context: InternalContext = {
      key,
      kind: definition.kind,
      id,
      definition,
      startSeq: event.seq,
      state: definition.start(event),
      dirty: true,
      node: null,
    };
    this.contexts.set(key, context);
    this.order.push(context);
    this.cacheValid = false;
  }

  private updateContext(
    definition: NodeDefinition,
    id: string,
    event: SessionEvent,
  ): void {
    const key = nodeKey(definition.kind, id);
    const context = this.contexts.get(key);
    if (context === undefined) {
      this.startContext(definition, id, event);
      return;
    }
    context.state = definition.update(context.state, event);
    context.dirty = true;
    this.cacheValid = false;
  }
}
