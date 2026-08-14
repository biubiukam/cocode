import type { Context } from '@deepseek-ai/cordis'
import { FocusTracker } from '../../runtime/focus/zones.ts'

export const name = 'focus'

export function apply(ctx: Context) {
  ctx.reflect.provide('focus', new FocusTracker())
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    focus: import('../../runtime/focus/zones.ts').FocusTracker
  }
}
