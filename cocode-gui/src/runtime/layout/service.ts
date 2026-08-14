/**
 * Layout store as a Cordis service. The zustand store stays the snapshot source.
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { createLayoutStore, type LayoutStore } from './store.ts'

export class LayoutService extends Service {
  readonly store: LayoutStore

  constructor(ctx: Context) {
    super(ctx, 'layout')
    const panels = ctx.get('panels')
    if (panels === undefined) throw new Error('layout requires panels')
    this.store = createLayoutStore(panels)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    layout: LayoutService
  }
}
