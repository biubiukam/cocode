import type { Context } from '@deepseek-ai/cordis'
import { LayoutService } from '../../runtime/layout/service.ts'

export const name = 'layout'
export const inject = ['panels']

export function apply(ctx: Context) {
  new LayoutService(ctx)
}
