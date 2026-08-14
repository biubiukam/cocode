import type { Context } from '@deepseek-ai/cordis'
import { SlotService } from '../../runtime/slots/service.ts'

export const name = 'slots'

export function apply(ctx: Context) {
  new SlotService(ctx)
}
