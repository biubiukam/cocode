import type { Context } from '@deepseek-ai/cordis'
import { ConnectionService } from '../../runtime/connection/service.ts'

export const name = 'connection'

export function apply(ctx: Context) {
  new ConnectionService(ctx)
}
