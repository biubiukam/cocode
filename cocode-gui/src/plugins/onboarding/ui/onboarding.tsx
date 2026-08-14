/**
 * Fixed first-run overlay. Not a generic Dialog — no close control, Esc asks
 * to skip after a confirmation line.
 */

import { useEffect } from 'react'
import { Button } from '@cocode/ui'
import { ForkPane } from './fork.tsx'
import { ProviderGallery } from './provider-gallery.tsx'
import { ProviderForm } from './provider-form.tsx'
import { DeviceLogin } from './device-login.tsx'
import type { OnboardingSnapshot } from '../../../runtime/onboarding/store.ts'
import type { AccountSnapshot } from '../../../runtime/account/store.ts'
import type { ProviderCard } from '../../../runtime/providers/store.ts'

export function OnboardingFrame({
  onboarding,
  account,
  cards,
  onChooseKey,
  onSignIn,
  onSelectProvider,
  onBack,
  onSkip,
  onConfirmSkip,
  onCancelSkip,
  onDraftKey,
  onDraftEndpoint,
  onToggleEndpoint,
  onSave,
}: {
  onboarding: OnboardingSnapshot
  account: AccountSnapshot
  cards: readonly ProviderCard[]
  onChooseKey(): void
  onSignIn(): void
  onSelectProvider(provider: string): void
  onBack(): void
  onSkip(): void
  onConfirmSkip(): void
  onCancelSkip(): void
  onDraftKey(value: string): void
  onDraftEndpoint(value: string): void
  onToggleEndpoint(): void
  onSave(): void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (onboarding.pane === 'skip-confirm') onCancelSkip()
      else onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onboarding.pane, onSkip, onCancelSkip])

  const selected = cards.find(card => card.provider === onboarding.selected)
  const showDevice = account.device !== null && onboarding.pane === 'fork'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--dialog-scrim)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="flex h-[560px] w-[600px] max-h-[88vh] max-w-[92vw] flex-col rounded-lg border border-border bg-surface-raised p-5 shadow-md"
      >
        <header className="shrink-0 pb-4">
          <h1 id="onboarding-title" className="text-[18px] font-semibold tracking-[-0.02em]">欢迎使用 Cocode</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">先让模型能跑起来。</p>
        </header>

        {onboarding.pane === 'fork' && !showDevice
          ? (
              <ForkPane
                privileged={onboarding.privileged}
                loginAvailable={onboarding.loginAvailable}
                signingIn={account.signingIn || onboarding.busy}
                signedIn={account.profile !== null}
                loginHint={onboarding.loginHint}
                loginError={onboarding.error ?? account.error}
                onChooseKey={onChooseKey}
                onSignIn={onSignIn}
              />
            )
          : null}

        {showDevice && account.device !== null
          ? (
              <DeviceLogin
                userCode={account.device.user_code}
                verificationUri={account.device.verification_uri_complete}
              />
            )
          : null}

        {onboarding.pane === 'gallery'
          ? <ProviderGallery cards={cards} onSelect={onSelectProvider} />
          : null}

        {onboarding.pane === 'form' && selected !== undefined
          ? (
              <ProviderForm
                card={selected}
                draftKey={onboarding.draftKey}
                draftEndpoint={onboarding.draftEndpoint}
                endpointOpen={onboarding.endpointOpen}
                busy={onboarding.busy}
                error={onboarding.error}
                onDraftKey={onDraftKey}
                onDraftEndpoint={onDraftEndpoint}
                onToggleEndpoint={onToggleEndpoint}
                onSave={onSave}
              />
            )
          : null}

        {onboarding.pane === 'skip-confirm'
          ? (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
                <p className="text-[13px] text-foreground">没有模型，什么都跑不了。确定跳过吗？</p>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={onConfirmSkip}>仍然跳过</Button>
                  <Button onClick={onCancelSkip}>返回</Button>
                </div>
              </div>
            )
          : null}

        <footer className="mt-4 flex shrink-0 items-center justify-between">
          {onboarding.pane === 'gallery' || onboarding.pane === 'form'
            ? <Button variant="ghost" onClick={onBack}>返回</Button>
            : <span />}
          {onboarding.pane === 'skip-confirm'
            ? null
            : <Button variant="ghost" onClick={onSkip}>跳过</Button>}
        </footer>
      </div>
    </div>
  )
}
