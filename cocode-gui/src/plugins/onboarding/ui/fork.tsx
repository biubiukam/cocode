/**
 * Presentational first-run cards. These components take props only — no runtime,
 * HostBridge, or transport.
 */

import { KeyRound, LogIn } from 'lucide-react'
import { cn } from '@cocode/ui'

export function ForkPane({
  privileged,
  loginAvailable,
  signingIn,
  signedIn,
  loginHint,
  loginError,
  onChooseKey,
  onSignIn,
}: {
  privileged: boolean
  loginAvailable: boolean
  signingIn: boolean
  signedIn: boolean
  loginHint?: string
  loginError?: string
  onChooseKey(): void
  onSignIn(): void
}) {
  const columns = privileged && loginAvailable ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className={cn('grid min-h-0 flex-1 gap-3', columns)}>
      {privileged
        ? (
            <button
              type="button"
              onClick={onChooseKey}
              className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 text-left shadow-sm hover:border-border-strong"
            >
              <KeyRound className="size-5 text-muted-foreground" />
              <span className="text-[14px] font-semibold">使用自己的 Key</span>
              <span className="text-[12px] leading-[1.45] text-muted-foreground">
                选提供方、贴 Key，凭证留在本机 harness。
              </span>
            </button>
          )
        : null}
      {loginAvailable
        ? (
            <button
              type="button"
              disabled={signingIn}
              onClick={onSignIn}
              className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 text-left shadow-sm hover:border-border-strong"
            >
              <LogIn className="size-5 text-muted-foreground" />
              <span className="text-[14px] font-semibold">登录 Cocode 账号</span>
              <span className="text-[12px] leading-[1.45] text-muted-foreground">
                {signingIn
                  ? '正在打开浏览器…'
                  : signedIn
                    ? '已登录。将写入托管模型。'
                    : '在浏览器完成登录，使用托管模型。'}
              </span>
            </button>
          )
        : null}
      {loginHint === undefined && loginError === undefined
        ? null
        : (
            <p className="col-span-full text-[12px] text-warning">
              {loginError ?? loginHint}
            </p>
          )}
    </div>
  )
}
