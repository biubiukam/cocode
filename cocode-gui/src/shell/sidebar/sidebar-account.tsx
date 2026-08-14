/**
 * Sidebar account rail — avatar, display name, and account actions.
 *
 * Snapshot comes from `ctx.account`; login/logout run through the onboarding
 * store so cloud routing is provisioned and torn down with the session.
 */

import { LogIn, LogOut, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  cn,
} from '@cocode/ui'
import { useToast } from '../overlay/toast.tsx'

/** Future wire snapshot; `null` means the user has not signed into Cocode yet. */
export type AccountProfile = {
  displayName: string
  email?: string
  avatarUrl?: string
}

function avatarGlyph(displayName: string): string {
  const trimmed = displayName.trim()
  if (trimmed === '') return '?'
  return trimmed.slice(0, 1).toUpperCase()
}

function AccountAvatar({ profile }: { profile: AccountProfile | null }) {
  const label = profile?.displayName ?? '访客'
  const glyph = avatarGlyph(label)

  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[11px] font-extrabold text-foreground',
        profile === null && 'border border-dashed border-border-strong text-muted-foreground',
      )}
    >
      {profile?.avatarUrl === undefined
        ? glyph
        : <img src={profile.avatarUrl} alt="" className="size-full object-cover" />}
    </span>
  )
}

export function SidebarAccount({
  profile = null,
  onOpenSettings,
  onSignIn,
  onSignOut,
}: {
  profile?: AccountProfile | null
  onOpenSettings(): void
  onSignIn?(): void
  onSignOut?(): void
}) {
  const toast = useToast()
  const signedIn = profile !== null
  const title = signedIn ? profile.displayName : '未登录'
  const subtitle = signedIn
    ? (profile.email ?? 'Cocode 账号')
    : '登录 Cocode 账号'

  return (
    <footer className="flex shrink-0 items-center gap-1 border-t border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={signedIn ? `${profile.displayName} 账号菜单` : '登录 Cocode 账号'}
            className={cn(
              'flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150',
              'hover:bg-secondary outline-none focus-visible:outline-none',
            )}
          >
            <AccountAvatar profile={profile} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold leading-[1.2] text-foreground">{title}</span>
              <span className="mt-0.5 block truncate text-[10px] leading-[1.2] text-muted-foreground">{subtitle}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-[200px]">
          <DropdownMenuGroup>
            {signedIn
              ? (
                  <DropdownMenuItem
                    icon={<LogOut />}
                    danger
                    onSelect={() => { onSignOut?.() }}
                    disabled={onSignOut === undefined}
                  >
                    退出登录
                  </DropdownMenuItem>
                )
              : (
                  <DropdownMenuItem
                    icon={<LogIn />}
                    onSelect={() => {
                      if (onSignIn !== undefined) onSignIn()
                      else toast.push('info', 'Cocode 账号登录即将推出')
                    }}
                  >
                    登录
                  </DropdownMenuItem>
                )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton size="sm" label="设置" onClick={onOpenSettings}>
        <Settings />
      </IconButton>
    </footer>
  )
}
