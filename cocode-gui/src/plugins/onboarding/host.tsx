/**
 * Overlay host: reads service snapshots and feeds presentational cards.
 */

import { useSyncExternalStore } from 'react'
import { useAccountStore, useConnection, useOnboarding, useProviders } from '../../shell/runtime-context.tsx'
import { OnboardingFrame } from './ui/onboarding.tsx'

export function OnboardingHost() {
  const onboardingStore = useOnboarding()
  const accountStore = useAccountStore()
  const providersStore = useProviders()
  const connection = useConnection()
  const onboarding = useSyncExternalStore(
    listener => onboardingStore.state.subscribe(listener),
    () => onboardingStore.state.get(),
  )
  const account = useSyncExternalStore(
    listener => accountStore.state.subscribe(listener),
    () => accountStore.state.get(),
  )
  const providers = useSyncExternalStore(
    listener => providersStore.state.subscribe(listener),
    () => providersStore.state.get(),
  )

  if (connection.phase !== 'ready' || !onboarding.open) return null

  return (
    <OnboardingFrame
      onboarding={onboarding}
      account={account}
      cards={providers.cards}
      onChooseKey={() => onboardingStore.showGallery()}
      onSignIn={() => { void onboardingStore.signIn() }}
      onSelectProvider={provider => onboardingStore.selectProvider(provider)}
      onBack={() => onboardingStore.showFork()}
      onSkip={() => onboardingStore.requestSkip()}
      onConfirmSkip={() => { void onboardingStore.confirmSkip() }}
      onCancelSkip={() => onboardingStore.cancelSkip()}
      onDraftKey={value => onboardingStore.setDraftKey(value)}
      onDraftEndpoint={value => onboardingStore.setDraftEndpoint(value)}
      onToggleEndpoint={() => onboardingStore.toggleEndpoint()}
      onSave={() => { void onboardingStore.testAndSave() }}
    />
  )
}
