import type { Context } from '@deepseek-ai/cordis'
import { AccountStore, type NativeAccountApi } from '../../runtime/account/store.ts'

export const name = 'account'

export function apply(ctx: Context) {
  const native = ctx.get('accountHost') as NativeAccountApi | undefined
  const store = new AccountStore(ctx.get('platform') === 'electron' ? 'electron' : 'browser', native)
  ctx.reflect.provide('account', store)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    account: AccountStore
    accountHost?: NativeAccountApi
  }
}
